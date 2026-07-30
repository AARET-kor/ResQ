import Capacitor
import EventKit
import Foundation
import UIKit

@objc(DeviceCalendarPlugin)
public final class DeviceCalendarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceCalendarPlugin"
    public let jsName = "DeviceCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listSources", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readItems", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "upsertEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "upsertReminder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteReminder", returnType: CAPPluginReturnPromise)
    ]

    private let eventStore = EKEventStore()
    private let isoFormatter = ISO8601DateFormatter()

    private func status(_ entity: EKEntityType) -> String {
        let authorization = EKEventStore.authorizationStatus(for: entity)
        if #available(iOS 17.0, *) {
            switch authorization {
            case .fullAccess:
                return "granted"
            case .writeOnly:
                return entity == .event ? "writeOnly" : "denied"
            case .denied, .restricted:
                return "denied"
            case .notDetermined:
                return "prompt"
            case .authorized:
                return "granted"
            @unknown default:
                return "denied"
            }
        } else {
            switch authorization {
            case .authorized:
                return "granted"
            case .denied, .restricted:
                return "denied"
            case .notDetermined:
                return "prompt"
            default:
                return "denied"
            }
        }
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        let finish: () -> Void = {
            call.resolve([
                "platform": "apple",
                "calendar": self.status(.event),
                "reminders": self.status(.reminder)
            ])
        }
        let requestReminders: () -> Void = {
            if #available(iOS 17.0, *) {
                self.eventStore.requestFullAccessToReminders { _, _ in finish() }
            } else {
                self.eventStore.requestAccess(to: .reminder) { _, _ in finish() }
            }
        }
        if #available(iOS 17.0, *) {
            eventStore.requestFullAccessToEvents { _, _ in requestReminders() }
        } else {
            eventStore.requestAccess(to: .event) { _, _ in requestReminders() }
        }
    }

    private func hexColor(_ color: CGColor) -> String? {
        guard let components = color.components else { return nil }
        let red: CGFloat
        let green: CGFloat
        let blue: CGFloat
        if components.count >= 3 {
            red = components[0]
            green = components[1]
            blue = components[2]
        } else if components.count == 2 {
            red = components[0]
            green = components[0]
            blue = components[0]
        } else {
            return nil
        }
        return String(
            format: "#%02X%02X%02X",
            Int(red * 255),
            Int(green * 255),
            Int(blue * 255)
        )
    }

    private func sourceObject(_ calendar: EKCalendar, type: String) -> JSObject {
        return [
            "externalId": calendar.calendarIdentifier,
            "name": calendar.title,
            "resourceType": type,
            "color": hexColor(calendar.cgColor) ?? NSNull(),
            "canWrite": calendar.allowsContentModifications,
            "account": calendar.source.title
        ]
    }

    @objc func listSources(_ call: CAPPluginCall) {
        guard status(.event) == "granted" || status(.reminder) == "granted" else {
            call.reject("Calendar or Reminders permission is required", "PERMISSION_REQUIRED")
            return
        }
        var sources: [JSObject] = []
        if status(.event) == "granted" {
            sources.append(contentsOf: eventStore.calendars(for: .event).map {
                sourceObject($0, type: "calendar")
            })
        }
        if status(.reminder) == "granted" {
            sources.append(contentsOf: eventStore.calendars(for: .reminder).map {
                sourceObject($0, type: "task_list")
            })
        }
        call.resolve(["platform": "apple", "sources": sources])
    }

    private func parseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        if let parsed = isoFormatter.date(from: value) { return parsed }
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        return fallback.date(from: value)
    }

    private func eventObject(_ event: EKEvent) -> JSObject {
        return [
            "id": event.eventIdentifier ?? event.calendarItemIdentifier,
            "sourceId": event.calendar.calendarIdentifier,
            "title": event.title ?? "(제목 없음)",
            "startsAt": isoFormatter.string(from: event.startDate),
            "endsAt": isoFormatter.string(from: event.endDate),
            "location": event.location ?? NSNull(),
            "updatedAt": event.lastModifiedDate.map(isoFormatter.string) ?? NSNull(),
            "url": event.url?.absoluteString ?? NSNull()
        ]
    }

    private func reminderObject(_ reminder: EKReminder) -> JSObject {
        var dueAt: Any = NSNull()
        if let components = reminder.dueDateComponents,
           let date = Calendar.current.date(from: components) {
            dueAt = isoFormatter.string(from: date)
        }
        return [
            "id": reminder.calendarItemIdentifier,
            "sourceId": reminder.calendar.calendarIdentifier,
            "title": reminder.title ?? "(제목 없음)",
            "dueAt": dueAt,
            "completed": reminder.isCompleted,
            "updatedAt": reminder.lastModifiedDate.map(isoFormatter.string) ?? NSNull(),
            "url": reminder.url?.absoluteString ?? NSNull()
        ]
    }

    @objc func readItems(_ call: CAPPluginCall) {
        guard let start = parseDate(call.getString("start")),
              let end = parseDate(call.getString("end")),
              start < end else {
            call.reject("A valid start/end range is required", "INVALID_RANGE")
            return
        }
        let calendarIds = Set(call.getArray("calendarIds", String.self) ?? [])
        let reminderListIds = Set(call.getArray("reminderListIds", String.self) ?? [])
        let eventCalendars = eventStore.calendars(for: .event).filter {
            calendarIds.contains($0.calendarIdentifier)
        }
        let reminderCalendars = eventStore.calendars(for: .reminder).filter {
            reminderListIds.contains($0.calendarIdentifier)
        }

        let events: [JSObject]
        if status(.event) == "granted" && !eventCalendars.isEmpty {
            let predicate = eventStore.predicateForEvents(
                withStart: start,
                end: end,
                calendars: eventCalendars
            )
            events = eventStore.events(matching: predicate).map(eventObject)
        } else {
            events = []
        }

        guard status(.reminder) == "granted" && !reminderCalendars.isEmpty else {
            call.resolve(["platform": "apple", "events": events, "reminders": []])
            return
        }
        let predicate = eventStore.predicateForReminders(in: reminderCalendars)
        eventStore.fetchReminders(matching: predicate) { reminders in
            let rows = (reminders ?? []).map(self.reminderObject)
            call.resolve(["platform": "apple", "events": events, "reminders": rows])
        }
    }

    private func calendar(with identifier: String, entity: EKEntityType) -> EKCalendar? {
        return eventStore.calendars(for: entity).first {
            $0.calendarIdentifier == identifier
        }
    }

    @objc func upsertEvent(_ call: CAPPluginCall) {
        guard status(.event) == "granted" else {
            call.reject("Calendar permission is required", "PERMISSION_REQUIRED")
            return
        }
        guard let calendarId = call.getString("sourceId"),
              let calendar = calendar(with: calendarId, entity: .event),
              calendar.allowsContentModifications,
              let title = call.getString("title"),
              let startsAt = parseDate(call.getString("startsAt")) else {
            call.reject("A writable calendar, title and start are required", "INVALID_EVENT")
            return
        }
        let event = call.getString("id").flatMap(eventStore.event(withIdentifier:)) ?? EKEvent(eventStore: eventStore)
        event.calendar = calendar
        event.title = title
        event.startDate = startsAt
        event.endDate = parseDate(call.getString("endsAt"))
            ?? startsAt.addingTimeInterval(3600)
        event.location = call.getString("location")
        do {
            try eventStore.save(event, span: .thisEvent, commit: true)
            call.resolve(eventObject(event))
        } catch {
            call.reject("Unable to save calendar event", "EVENT_SAVE_FAILED", error)
        }
    }

    @objc func deleteEvent(_ call: CAPPluginCall) {
        guard let identifier = call.getString("id") else {
            call.reject("Event id is required", "INVALID_EVENT")
            return
        }
        guard let event = eventStore.event(withIdentifier: identifier) else {
            call.resolve()
            return
        }
        do {
            try eventStore.remove(event, span: .thisEvent, commit: true)
            call.resolve()
        } catch {
            call.reject("Unable to delete calendar event", "EVENT_DELETE_FAILED", error)
        }
    }

    @objc func upsertReminder(_ call: CAPPluginCall) {
        guard status(.reminder) == "granted" else {
            call.reject("Reminders permission is required", "PERMISSION_REQUIRED")
            return
        }
        guard let listId = call.getString("sourceId"),
              let list = calendar(with: listId, entity: .reminder),
              list.allowsContentModifications,
              let title = call.getString("title") else {
            call.reject("A writable reminder list and title are required", "INVALID_REMINDER")
            return
        }
        let existing = call.getString("id").flatMap {
            eventStore.calendarItem(withIdentifier: $0) as? EKReminder
        }
        let reminder = existing ?? EKReminder(eventStore: eventStore)
        reminder.calendar = list
        reminder.title = title
        reminder.isCompleted = call.getBool("completed") ?? false
        if let due = parseDate(call.getString("dueAt")) {
            reminder.dueDateComponents = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute, .timeZone],
                from: due
            )
        } else {
            reminder.dueDateComponents = nil
        }
        do {
            try eventStore.save(reminder, commit: true)
            call.resolve(reminderObject(reminder))
        } catch {
            call.reject("Unable to save reminder", "REMINDER_SAVE_FAILED", error)
        }
    }

    @objc func deleteReminder(_ call: CAPPluginCall) {
        guard let identifier = call.getString("id") else {
            call.reject("Reminder id is required", "INVALID_REMINDER")
            return
        }
        guard let reminder = eventStore.calendarItem(withIdentifier: identifier) as? EKReminder else {
            call.resolve()
            return
        }
        do {
            try eventStore.remove(reminder, commit: true)
            call.resolve()
        } catch {
            call.reject("Unable to delete reminder", "REMINDER_DELETE_FAILED", error)
        }
    }
}
