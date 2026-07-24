import Capacitor

final class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginType(DeviceCalendarPlugin.self)
    }
}
