import Capacitor

// Alerts in the app come through Apple (@capacitor/push-notifications, server/apns.ts). A build run from
// Xcode gets its device token from Apple's sandbox, TestFlight and the App Store from the real service;
// the page asks which this is and tells the server with the token (web/src/lib/native.ts).

@objc(AppAlertsPlugin)
public class AppAlertsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppAlertsPlugin"
    public let jsName = "AppAlerts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "environment", returnType: CAPPluginReturnPromise),
    ]

    @objc func environment(_ call: CAPPluginCall) {
        #if DEBUG
            call.resolve(["sandbox": true])
        #else
            call.resolve(["sandbox": false])
        #endif
    }
}
