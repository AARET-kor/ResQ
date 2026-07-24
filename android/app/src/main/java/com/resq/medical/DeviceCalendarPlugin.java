package com.resq.medical;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

@CapacitorPlugin(
    name = "DeviceCalendar",
    permissions = {
        @Permission(
            alias = "calendar",
            strings = {
                Manifest.permission.READ_CALENDAR,
                Manifest.permission.WRITE_CALENDAR
            }
        )
    }
)
public class DeviceCalendarPlugin extends Plugin {

    private long parseIsoTimestamp(String value) throws ParseException {
        ParseException lastError = null;
        String[] patterns = {
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX"
        };
        for (String pattern : patterns) {
            try {
                return new SimpleDateFormat(pattern, Locale.US).parse(value).getTime();
            } catch (ParseException error) {
                lastError = error;
            }
        }
        throw lastError == null ? new ParseException("Invalid ISO timestamp", 0) : lastError;
    }

    private String formatIsoTimestamp(long value) {
        SimpleDateFormat formatter =
            new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date(value));
    }

    private boolean calendarGranted() {
        return getPermissionState("calendar") == PermissionState.GRANTED;
    }

    private JSObject permissionResult() {
        return new JSObject()
            .put("platform", "android")
            .put("calendar", calendarGranted() ? "granted" : "denied")
            .put("reminders", "unsupported");
    }

    @PluginMethod
    @Override
    public void requestPermissions(PluginCall call) {
        if (calendarGranted()) {
            call.resolve(permissionResult());
            return;
        }
        requestPermissionForAlias("calendar", call, "calendarPermissionCallback");
    }

    @PermissionCallback
    private void calendarPermissionCallback(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void listSources(PluginCall call) {
        if (!calendarGranted()) {
            call.reject("Calendar permission is required", "PERMISSION_REQUIRED");
            return;
        }
        JSArray rows = new JSArray();
        String[] projection = {
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.CALENDAR_COLOR,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.VISIBLE
        };
        try (Cursor cursor = getContext().getContentResolver().query(
            CalendarContract.Calendars.CONTENT_URI,
            projection,
            null,
            null,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC"
        )) {
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    if (cursor.getInt(5) == 0) continue;
                    int accessLevel = cursor.getInt(3);
                    String color = String.format("#%06X", 0xFFFFFF & cursor.getInt(2));
                    rows.put(new JSObject()
                        .put("externalId", String.valueOf(cursor.getLong(0)))
                        .put("name", cursor.getString(1))
                        .put("resourceType", "calendar")
                        .put("color", color)
                        .put("canWrite", accessLevel >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)
                        .put("account", cursor.getString(4)));
                }
            }
            call.resolve(new JSObject().put("platform", "android").put("sources", rows));
        } catch (SecurityException error) {
            call.reject("Calendar permission is required", "PERMISSION_REQUIRED", error);
        }
    }

    private Set<String> stringSet(JSArray values) {
        Set<String> result = new HashSet<>();
        if (values == null) return result;
        try {
            List<Object> list = values.toList();
            for (Object value : list) {
                if (value instanceof String) result.add((String) value);
            }
        } catch (Exception ignored) {}
        return result;
    }

    @PluginMethod
    public void readItems(PluginCall call) {
        if (!calendarGranted()) {
            call.reject("Calendar permission is required", "PERMISSION_REQUIRED");
            return;
        }
        String startValue = call.getString("start");
        String endValue = call.getString("end");
        if (startValue == null || endValue == null) {
            call.reject("A valid start/end range is required", "INVALID_RANGE");
            return;
        }
        long start;
        long end;
        try {
            start = parseIsoTimestamp(startValue);
            end = parseIsoTimestamp(endValue);
        } catch (Exception error) {
            call.reject("A valid start/end range is required", "INVALID_RANGE", error);
            return;
        }
        Set<String> selectedCalendars = stringSet(call.getArray("calendarIds"));
        JSArray events = new JSArray();
        String[] projection = {
            CalendarContract.Events._ID,
            CalendarContract.Events.CALENDAR_ID,
            CalendarContract.Events.TITLE,
            CalendarContract.Events.DTSTART,
            CalendarContract.Events.DTEND,
            CalendarContract.Events.EVENT_LOCATION,
            CalendarContract.Events.LAST_DATE
        };
        String selection =
            CalendarContract.Events.DELETED + "=0 AND " +
            CalendarContract.Events.DTSTART + ">=? AND " +
            CalendarContract.Events.DTSTART + "<?";
        String[] args = { String.valueOf(start), String.valueOf(end) };
        try (Cursor cursor = getContext().getContentResolver().query(
            CalendarContract.Events.CONTENT_URI,
            projection,
            selection,
            args,
            CalendarContract.Events.DTSTART + " ASC"
        )) {
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String calendarId = String.valueOf(cursor.getLong(1));
                    if (!selectedCalendars.contains(calendarId)) continue;
                    long startsAt = cursor.getLong(3);
                    long endsAt = cursor.isNull(4) ? startsAt + 3_600_000 : cursor.getLong(4);
                    events.put(new JSObject()
                        .put("id", String.valueOf(cursor.getLong(0)))
                        .put("sourceId", calendarId)
                        .put("title", cursor.isNull(2) ? "(제목 없음)" : cursor.getString(2))
                        .put("startsAt", formatIsoTimestamp(startsAt))
                        .put("endsAt", formatIsoTimestamp(endsAt))
                        .put("location", cursor.isNull(5) ? null : cursor.getString(5))
                        .put("updatedAt", cursor.isNull(6)
                            ? null
                            : formatIsoTimestamp(cursor.getLong(6)))
                        .put("url", "content://com.android.calendar/events/" + cursor.getLong(0)));
                }
            }
            call.resolve(new JSObject()
                .put("platform", "android")
                .put("events", events)
                .put("reminders", new JSArray()));
        } catch (SecurityException error) {
            call.reject("Unable to read device calendars", "CALENDAR_READ_FAILED", error);
        }
    }

    @PluginMethod
    public void upsertEvent(PluginCall call) {
        if (!calendarGranted()) {
            call.reject("Calendar permission is required", "PERMISSION_REQUIRED");
            return;
        }
        String sourceId = call.getString("sourceId");
        String title = call.getString("title");
        String startsAtValue = call.getString("startsAt");
        if (sourceId == null || title == null || startsAtValue == null) {
            call.reject("A writable calendar, title and start are required", "INVALID_EVENT");
            return;
        }
        try {
            long startsAt = parseIsoTimestamp(startsAtValue);
            String endsAtValue = call.getString("endsAt");
            long endsAt = endsAtValue == null
                ? startsAt + 3_600_000
                : parseIsoTimestamp(endsAtValue);
            ContentValues values = new ContentValues();
            values.put(CalendarContract.Events.CALENDAR_ID, Long.parseLong(sourceId));
            values.put(CalendarContract.Events.TITLE, title);
            values.put(CalendarContract.Events.DTSTART, startsAt);
            values.put(CalendarContract.Events.DTEND, endsAt);
            values.put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
            values.put(CalendarContract.Events.EVENT_END_TIMEZONE, TimeZone.getDefault().getID());
            String location = call.getString("location");
            if (location != null) values.put(CalendarContract.Events.EVENT_LOCATION, location);

            String id = call.getString("id");
            Uri uri;
            if (id == null) {
                uri = getContext().getContentResolver().insert(
                    CalendarContract.Events.CONTENT_URI,
                    values
                );
            } else {
                uri = ContentUris.withAppendedId(
                    CalendarContract.Events.CONTENT_URI,
                    Long.parseLong(id)
                );
                getContext().getContentResolver().update(uri, values, null, null);
            }
            if (uri == null) throw new IllegalStateException("No event URI returned");
            String resolvedId = String.valueOf(ContentUris.parseId(uri));
            call.resolve(new JSObject()
                .put("id", resolvedId)
                .put("sourceId", sourceId)
                .put("title", title)
                .put("startsAt", formatIsoTimestamp(startsAt))
                .put("endsAt", formatIsoTimestamp(endsAt))
                .put("location", location));
        } catch (Exception error) {
            call.reject("Unable to save calendar event", "EVENT_SAVE_FAILED", error);
        }
    }

    @PluginMethod
    public void deleteEvent(PluginCall call) {
        if (!calendarGranted()) {
            call.reject("Calendar permission is required", "PERMISSION_REQUIRED");
            return;
        }
        String id = call.getString("id");
        if (id == null) {
            call.reject("Event id is required", "INVALID_EVENT");
            return;
        }
        try {
            Uri uri = ContentUris.withAppendedId(
                CalendarContract.Events.CONTENT_URI,
                Long.parseLong(id)
            );
            getContext().getContentResolver().delete(uri, null, null);
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to delete calendar event", "EVENT_DELETE_FAILED", error);
        }
    }

    @PluginMethod
    public void upsertReminder(PluginCall call) {
        call.unimplemented("Android does not expose a standard reminders provider. Connect Microsoft To Do for Samsung Reminder.");
    }

    @PluginMethod
    public void deleteReminder(PluginCall call) {
        call.unimplemented("Android does not expose a standard reminders provider. Connect Microsoft To Do for Samsung Reminder.");
    }
}
