import Capacitor
import LocalAuthentication
import Security

// A grown-up's PIN kept on their own iPhone or iPad behind Face ID (or Touch ID), so the PIN sheets
// (leaving kid mode, stars in jars, unlocking) can ask for a face instead (web/src/lib/useFaceIdPin.ts).
// The server still checks the PIN itself: this only hands it over after Face ID. The Keychain item is
// tied to the faces enrolled now (biometryCurrentSet), so adding a face or resetting Face ID makes it
// unreadable, and it never leaves this device (no iCloud Keychain, no backups).

@objc(FaceIdPinPlugin)
public class FaceIdPinPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FaceIdPinPlugin"
    public let jsName = "FaceIdPin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "kind", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "has", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private let service = "com.sprigfamily.app.pin"

    /// This item: one per grown-up signed in here (`account` is theirs, from the page).
    private func item(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    /// faceID, touchID, or none (no Face ID on this device, or none set up).
    @objc func kind(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return call.resolve(["kind": "none"])
        }
        switch context.biometryType {
        case .faceID: call.resolve(["kind": "faceID"])
        case .touchID: call.resolve(["kind": "touchID"])
        default: call.resolve(["kind": "none"])
        }
    }

    /// Whether a PIN is saved for `account`, without asking for Face ID.
    @objc func has(_ call: CAPPluginCall) {
        guard let account = call.getString("account") else { return call.reject("No account") }
        let context = LAContext()
        context.interactionNotAllowed = true
        var query = item(account)
        query[kSecUseAuthenticationContext as String] = context
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        // Found, but it would need Face ID to read: it's there.
        call.resolve(["has": status == errSecSuccess || status == errSecInteractionNotAllowed])
    }

    /// Keeps `pin` for `account`, readable only after Face ID (replacing one saved before).
    @objc func save(_ call: CAPPluginCall) {
        guard let account = call.getString("account"), let pin = call.getString("pin"), let data = pin.data(using: .utf8) else {
            return call.reject("No PIN")
        }
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, &error
        ) else { return call.reject("Face ID isn't available here") }
        SecItemDelete(item(account) as CFDictionary)
        var add = item(account)
        add[kSecValueData as String] = data
        add[kSecAttrAccessControl as String] = access
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecSuccess { call.resolve() } else { call.reject("Couldn't keep the PIN (\(status))") }
    }

    /// The saved PIN, after Face ID. Rejects with code "canceled" (closed, or not this face), or "missing"
    /// (none saved, or Face ID changed since).
    @objc func read(_ call: CAPPluginCall) {
        guard let account = call.getString("account") else { return call.reject("No account") }
        let reason = call.getString("reason") ?? "Use Face ID instead of your PIN"
        // Reading waits for Face ID, so not on the main thread.
        DispatchQueue.global(qos: .userInitiated).async {
            let context = LAContext()
            context.localizedReason = reason
            var query = self.item(account)
            query[kSecReturnData as String] = true
            query[kSecUseAuthenticationContext as String] = context
            var out: AnyObject?
            let status = SecItemCopyMatching(query as CFDictionary, &out)
            if status == errSecSuccess, let data = out as? Data, let pin = String(data: data, encoding: .utf8) {
                call.resolve(["pin": pin])
            } else if status == errSecUserCanceled || status == errSecAuthFailed {
                call.reject("Face ID was canceled", "canceled")
            } else if status == errSecItemNotFound {
                call.reject("No PIN saved", "missing")
            } else {
                call.reject("Face ID didn't work (\(status))", "failed")
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let account = call.getString("account") else { return call.reject("No account") }
        SecItemDelete(item(account) as CFDictionary)
        call.resolve()
    }
}
