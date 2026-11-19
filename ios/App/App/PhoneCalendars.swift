import BackgroundTasks
import Capacitor
import EventKit
import Security

// The phone's own calendars, shared with the family without a password (server/phoneCalendars.ts). The page
// asks for access and picks which calendars to share; from then on this file does the sending itself:
// whenever Sprig opens (the page calls syncNow) and when iOS lets it refresh in the background, so the
// family sees changes made in the Calendar app even if Sprig isn't opened. Sending is all here, not in the
// page, because the page doesn't run in the background.

/** What to send and where: set by the page, kept for background refreshes. */
private struct Setup: Codable {
    var server: String
    var phone: String
    var name: String
    var calendarIds: [String]
}

enum PhoneCalendarSync {
    static let task = "com.sprigfamily.app.calendars"
    private static let setupKey = "phoneCalendars.setup"
    private static let tokenAccount = "phoneCalendars.token"
    /// Months either side of today, the same window as the server's (shared/calendars.ts PHONE_MONTHS).
    private static let monthsBack = 3, monthsAhead = 13
    static let store = EKEventStore()

    fileprivate static var setup: Setup? {
        get { UserDefaults.standard.data(forKey: setupKey).flatMap { try? JSONDecoder().decode(Setup.self, from: $0) } }
        set { UserDefaults.standard.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: setupKey) }
    }

    /// The sign-in token, in the Keychain: readable after the phone's first unlock, so background refreshes work.
    static var token: String? {
        get {
            var out: AnyObject?
            let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: tokenAccount,
                                        kSecReturnData as String: true]
            guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: tokenAccount]
            SecItemDelete(query as CFDictionary)
            guard let value = newValue?.data(using: .utf8) else { return }
            var add = query
            add[kSecValueData as String] = value
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    static var allowed: Bool {
        if #available(iOS 17.0, *) { return EKEventStore.authorizationStatus(for: .event) == .fullAccess }
        return EKEventStore.authorizationStatus(for: .event) == .authorized
    }

    /// Sends the chosen calendars now. Throws when it couldn't; returns how many events went.
    @discardableResult
    static func send() async throws -> Int {
        guard let setup, let token, allowed else { throw SyncError.notSetUp }
        let calendars = store.calendars(for: .event).filter { setup.calendarIds.contains($0.calendarIdentifier) }
        let primary = store.defaultCalendarForNewEvents?.calendarIdentifier
        let cal = Calendar.current
        let thisMonth = cal.date(from: cal.dateComponents([.year, .month], from: Date()))!
        let from = cal.date(byAdding: .month, value: -monthsBack, to: thisMonth)!
        let to = cal.date(byAdding: .month, value: monthsAhead, to: thisMonth)!
        let events = calendars.isEmpty ? [] : store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: calendars))

        let body: [String: Any] = [
            "name": setup.name,
            "calendars": calendars.map { c in
                [
                    "id": c.calendarIdentifier,
                    "name": c.title.isEmpty ? "Calendar" : c.title,
                    "color": hex(c.cgColor) as Any,
                    "account": c.source?.title ?? "",
                    "primary": c.calendarIdentifier == primary,
                ] as [String: Any]
            },
            "events": events.compactMap(json),
        ]
        var request = URLRequest(url: URL(string: "\(setup.server)/api/phone-calendars/\(setup.phone)")!)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let status = (response as? HTTPURLResponse)?.statusCode, status < 300 else { throw SyncError.refused }
        return events.count
    }

    /// One occurrence as the server takes it; nil for one it can't place.
    private static func json(_ e: EKEvent) -> [String: Any]? {
        guard let start = e.startDate, let end = e.endDate, let id = e.calendarItemIdentifier as String? else { return nil }
        let iso = ISO8601DateFormatter()
        // An all-day event ends at the start of its last day, or the next; the server wants the day after.
        let day = DateFormatter()
        day.calendar = Calendar(identifier: .gregorian)
        day.timeZone = .current
        day.dateFormat = "yyyy-MM-dd"
        let allDayEnd = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: end.addingTimeInterval(-1)))!
        return [
            "calendarId": e.calendar.calendarIdentifier,
            // Every occurrence of a repeat shares its id; its start tells them apart.
            "id": String("\(id)#\(iso.string(from: start))".prefix(400)),
            "title": String((e.title ?? "").prefix(1000)),
            "allDay": e.isAllDay,
            "start": e.isAllDay ? day.string(from: start) : iso.string(from: start),
            "end": e.isAllDay ? day.string(from: max(allDayEnd, start.addingTimeInterval(86_400))) : iso.string(from: end),
            "location": e.location.map { String($0.prefix(1000)) } as Any,
            "notes": e.notes.map { String($0.prefix(20_000)) } as Any,
        ]
    }

    private static func hex(_ color: CGColor?) -> String? {
        guard let rgb = color?.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil),
              let c = rgb.components, c.count >= 3 else { return nil }
        return String(format: "#%02x%02x%02x", Int(c[0] * 255), Int(c[1] * 255), Int(c[2] * 255))
    }

    // MARK: Background refresh

    /// Called once at launch (AppDelegate): what iOS runs when it lets Sprig refresh.
    static func registerBackground() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: task, using: nil) { task in
            scheduleBackground()
            let work = Task { try? await send() }
            task.expirationHandler = { work.cancel() }
            Task {
                _ = await work.result
                task.setTaskCompleted(success: !work.isCancelled)
            }
        }
    }

    /// Asks iOS for the next refresh, an hour or more from now (it picks when, around how the phone is used).
    static func scheduleBackground() {
        guard setup != nil else { return }
        let request = BGAppRefreshTaskRequest(identifier: task)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    enum SyncError: LocalizedError {
        case notSetUp, refused
        var errorDescription: String? {
            switch self {
            case .notSetUp: return "Calendars aren't shared from this phone"
            case .refused: return "Sprig didn't take the calendars. Try again in a minute."
            }
        }
    }
}

@objc(PhoneCalendarsPlugin)
public class PhoneCalendarsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoneCalendarsPlugin"
    public let jsName = "PhoneCalendars"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "access", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calendars", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shared", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncNow", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    /// granted, denied (said no, or not allowed on this phone), or prompt (not asked yet).
    @objc func access(_ call: CAPPluginCall) {
        let status = EKEventStore.authorizationStatus(for: .event)
        call.resolve(["access": PhoneCalendarSync.allowed ? "granted" : status == .notDetermined ? "prompt" : "denied"])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        let done: (Bool, Error?) -> Void = { granted, _ in call.resolve(["granted": granted]) }
        if #available(iOS 17.0, *) {
            PhoneCalendarSync.store.requestFullAccessToEvents(completion: done)
        } else {
            PhoneCalendarSync.store.requestAccess(to: .event, completion: done)
        }
    }

    /// The phone's calendars that hold events, by account.
    @objc func calendars(_ call: CAPPluginCall) {
        guard PhoneCalendarSync.allowed else { return call.reject("No access to calendars") }
        let primary = PhoneCalendarSync.store.defaultCalendarForNewEvents?.calendarIdentifier
        let list = PhoneCalendarSync.store.calendars(for: .event)
            // Holidays and birthdays the phone adds itself aren't the family's.
            .filter { $0.type != .birthday }
            .map { c in
                ["id": c.calendarIdentifier, "name": c.title, "account": c.source?.title ?? "",
                 "primary": c.calendarIdentifier == primary] as [String: Any]
            }
        call.resolve(["calendars": list])
    }

    /// Starts (or changes) sharing: which calendars, to which server, signed in how. Sends straight away.
    @objc func share(_ call: CAPPluginCall) {
        guard let server = call.getString("server"), let phone = call.getString("phone"), let name = call.getString("name"),
              let token = call.getString("token"), let ids = call.getArray("calendarIds", String.self)
        else { return call.reject("Missing what to share") }
        PhoneCalendarSync.setup = Setup(server: server, phone: phone, name: name, calendarIds: ids)
        PhoneCalendarSync.token = token
        PhoneCalendarSync.scheduleBackground()
        sync(call)
    }

    /// What's shared from this phone, or nothing.
    @objc func shared(_ call: CAPPluginCall) {
        guard let setup = PhoneCalendarSync.setup else { return call.resolve([:]) }
        call.resolve(["phone": setup.phone, "calendarIds": setup.calendarIds])
    }

    /// Sends now (the page calls it when Sprig opens); resolves with how many events went.
    @objc func syncNow(_ call: CAPPluginCall) {
        if let token = call.getString("token") { PhoneCalendarSync.token = token }
        sync(call)
    }

    /// Stops sharing from this phone (signing out, or turned off in Settings).
    @objc func stop(_ call: CAPPluginCall) {
        PhoneCalendarSync.setup = nil
        PhoneCalendarSync.token = nil
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: PhoneCalendarSync.task)
        call.resolve()
    }

    private func sync(_ call: CAPPluginCall) {
        Task {
            do {
                let events = try await PhoneCalendarSync.send()
                call.resolve(["events": events])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
