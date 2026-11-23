import AuthenticationServices
import Capacitor

// Sign in with Apple through the iPhone's own sheet (Face ID, Hide My Email): Apple's web pop-up doesn't
// work inside an app. The page gets the same ID token the pop-up gives and sends it to the server as
// before (web/src/lib/native.ts); the token is for the app's bundle id, which the server accepts too.

/** The app's web view, with the plugins that live in the app itself. */
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SignInWithApplePlugin())
        bridge?.registerPluginInstance(AppAlertsPlugin())
        bridge?.registerPluginInstance(PhoneCalendarsPlugin())
        bridge?.registerPluginInstance(FaceIdPinPlugin())
        // Swipe from the left edge to go back, as in Safari: back through the steps the pages keep in
        // their history (a link from one page to another, web/src/lib/usePage.ts), with the page before
        // sliding in under the finger.
        webView?.allowsBackForwardNavigationGestures = true
    }
}

@objc(SignInWithApplePlugin)
public class SignInWithApplePlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "SignInWithApplePlugin"
    public let jsName = "SignInWithApple"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)]

    // The sign-in under way (one at a time), and its sheet.
    private var call: CAPPluginCall?
    private var controller: ASAuthorizationController?

    @objc func signIn(_ call: CAPPluginCall) {
        self.call?.reject("Another sign-in started")
        self.call = call
        DispatchQueue.main.async {
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.webView?.window ?? UIWindow()
    }

    public func authorizationController(
        controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken, let idToken = String(data: data, encoding: .utf8)
        else { return finish { $0.reject("Apple didn't sign you in") } }
        // Apple gives the name only the first time someone signs in.
        let name = [credential.fullName?.givenName, credential.fullName?.familyName].compactMap { $0 }.joined(separator: " ")
        finish { $0.resolve(["idToken": idToken, "name": name]) }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        // Closing the sheet isn't an error worth showing.
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        finish { $0.reject(canceled ? "canceled" : error.localizedDescription, canceled ? "canceled" : nil) }
    }

    private func finish(_ answer: (CAPPluginCall) -> Void) {
        if let call { answer(call) }
        call = nil
        controller = nil
    }
}
