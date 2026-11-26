import BackgroundTasks
import Capacitor
import EventKit
import Security

// The phone's own calendars, shared with the family without a password (server/phoneCalendars.ts). The page
// asks for access and picks which calendars to share; from then on this file does the sending itself:
// whenever Sprig opens (the page calls syncNow) and when iOS lets it refresh in the background, so the
// family sees changes made in the Calendar app even if Sprig isn't opened. Each time, Sprig answers with
// changes made there to these calendars (server/phoneOutbox.ts), which this file saves with EventKit and
// reports back. Sending is all here, not in the page, because the page doesn't run in the background.

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

    /// This phone's address with Apple (AppDelegate), sent so Sprig can wake it when changes wait for it.
    private static let wakeKey = "phoneCalendars.wakeToken"
    static var wakeToken: String? {
        get { UserDefaults.standard.string(forKey: wakeKey) }
        set { UserDefaults.standard.set(newValue, forKey: wakeKey) }
    }

    /// Asks Apple for the address (no prompt: waking silently needs no permission to show alerts).
    static func askToBeWoken() {
        DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
    }

    static var allowed: Bool {
        if #available(iOS 17.0, *) { return EKEventStore.authorizationStatus(for: .event) == .fullAccess }
        return EKEventStore.authorizationStatus(for: .event) == .authorized
    }

    /// Sends the chosen calendars now, and saves what was changed in Sprig to them. Throws when it couldn't;
    /// returns how many events went.
    @discardableResult
    static func send() async throws -> Int {
        guard setup != nil, token != nil, allowed else { throw SyncError.notSetUp }
        // What was saved last time but never reached Sprig goes first.
        await report()
        let (count, edits) = try await sendCalendars()
        guard !edits.isEmpty else { return count }
        for edit in edits { saveEdit(edit) }
        await report()
        // Again, so Sprig has them as they are now (a new event under the id the phone gave it).
        return try await sendCalendars().events
    }

    /// Sends the chosen calendars; Sprig answers with the changes made there for this phone to save.
    private static func sendCalendars() async throws -> (events: Int, edits: [[String: Any]]) {
        guard let setup, let token else { throw SyncError.notSetUp }
        let calendars = store.calendars(for: .event).filter { setup.calendarIds.contains($0.calendarIdentifier) }
        let primary = store.defaultCalendarForNewEvents?.calendarIdentifier
        let cal = Calendar.current
        let thisMonth = cal.date(from: cal.dateComponents([.year, .month], from: Date()))!
        let from = cal.date(byAdding: .month, value: -monthsBack, to: thisMonth)!
        let to = cal.date(byAdding: .month, value: monthsAhead, to: thisMonth)!
        let events = calendars.isEmpty ? [] : store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: calendars))

        // A build run from Xcode gets its address from Apple's sandbox (as in Alerts.swift).
        #if DEBUG
            let sandbox = true
        #else
            let sandbox = false
        #endif
        let wake: [String: Any] = wakeToken.map { ["wake": ["token": $0, "sandbox": sandbox]] } ?? [:]
        let body = { (newer: Bool) -> [String: Any] in [
            "name": setup.name,
            "calendars": calendars.map { c in
                [
                    "id": c.calendarIdentifier,
                    "name": c.title.isEmpty ? "Calendar" : c.title,
                    "color": hex(c.cgColor) as Any,
                    "account": c.source?.title ?? "",
                    "primary": c.calendarIdentifier == primary,
                ].merging(newer ? ["writable": c.allowsContentModifications] : [:]) { a, _ in a } as [String: Any]
            },
            "events": events.compactMap(json),
        ].merging(newer ? wake : [:]) { a, _ in a } }
        let path = "/api/phone-calendars/\(setup.phone)"
        // Changes made in Sprig can be saved to a calendar that allows it (not a subscribed or shared read-only one).
        var (data, status) = try await request("PUT", path, body(true), token: token)
        // A Sprig from before it could take them back turns "writable" and "wake" away: send as before.
        if status == 400 { (data, status) = try await request("PUT", path, body(false), token: token) }
        guard status < 300 else { throw SyncError.refused }
        let answer = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        return (events.count, answer?["edits"] as? [[String: Any]] ?? [])
    }

    /// Sends to Sprig; answers with what came back and its status. Throws only when it didn't get there.
    private static func request(_ method: String, _ path: String, _ body: [String: Any], token: String) async throws
        -> (Data, Int)
    {
        guard let setup else { throw SyncError.notSetUp }
        var request = URLRequest(url: URL(string: "\(setup.server)\(path)")!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    // MARK: Saving changes made in Sprig

    /// What was done with each change, kept until Sprig has it: a change handed out again (its answer was lost)
    /// is answered from here instead of being saved twice (a repeat moved an hour twice).
    private static let doneKey = "phoneCalendars.done"
    private static var done: [[String: Any]] {
        get { UserDefaults.standard.array(forKey: doneKey) as? [[String: Any]] ?? [] }
        set { UserDefaults.standard.set(newValue, forKey: doneKey) }
    }

    /// Tells Sprig what was done; forgotten once it has them, or turns them away (4xx: they'd go round forever).
    private static func report() async {
        let results = done
        guard !results.isEmpty, let setup, let token else { return }
        // Offline, or Sprig down (5xx): kept, and tried again next time.
        guard let (_, status) = try? await request("POST", "/api/phone-calendars/\(setup.phone)/edits",
                                                   ["results": results], token: token),
              status >= 200, status < 500 else { return }
        // Only what was sent: anything saved meanwhile stays for next time.
        done = done.filter { r in !results.contains { $0["id"] as? Int == r["id"] as? Int && $0["version"] as? String == r["version"] as? String } }
    }

    /// Saves one change with EventKit (once), and keeps how it went for report().
    private static func saveEdit(_ edit: [String: Any]) {
        guard let id = edit["id"] as? Int, let version = edit["version"] as? String else { return }
        if done.contains(where: { $0["id"] as? Int == id && $0["version"] as? String == version }) { return }
        var result: [String: Any] = ["id": id, "version": version, "saved": true]
        do {
            if let newId = try apply(edit) { result["eventId"] = newId }
        } catch {
            result["saved"] = false
            result["error"] = String(error.localizedDescription.prefix(500))
        }
        done.append(result)
    }

    /// The change itself. Returns the new event's id when it made one.
    private static func apply(_ edit: [String: Any]) throws -> String? {
        let changes = edit["changes"] as? [String: Any] ?? [:]
        guard let calendarId = edit["calendarId"] as? String, let calendar = store.calendar(withIdentifier: calendarId)
        else { throw EditError.noCalendar }
        guard calendar.allowsContentModifications else { throw EditError.readOnly }
        let op = edit["op"] as? String

        if op == "create" {
            let event = EKEvent(eventStore: store)
            event.calendar = calendar
            event.title = ""
            try set(event, changes)
            try store.save(event, span: .thisEvent, commit: true)
            return occurrenceId(event)
        }
        guard let eventId = edit["eventId"] as? String else { throw EditError.notFound }

        if edit["series"] as? Bool == true {
            // The first day, saved with every one after it: the whole repeat.
            guard let first = store.calendarItem(withIdentifier: eventId) as? EKEvent else { throw EditError.notFound }
            if op == "delete" {
                try store.remove(first, span: .futureEvents, commit: true)
                return nil
            }
            if let title = changes["title"] as? String { first.title = title }
            if changes.keys.contains("location") { first.location = changes["location"] as? String }
            if let start = first.startDate, let end = first.endDate {
                let shift = (changes["shiftMs"] as? Double ?? 0) / 1000
                let newStart = start.addingTimeInterval(shift)
                first.startDate = newStart
                first.endDate = (changes["durationMs"] as? Double).map { newStart.addingTimeInterval($0 / 1000) }
                    ?? end.addingTimeInterval(shift)
            }
            try store.save(first, span: .futureEvents, commit: true)
            return nil
        }

        guard let event = occurrence(eventId, in: calendar) else { throw EditError.notFound }
        if op == "delete" {
            try store.remove(event, span: .thisEvent, commit: true)
        } else {
            try set(event, changes)
            try store.save(event, span: .thisEvent, commit: true)
        }
        return nil
    }

    /// One day of an event by the id json() gave it: the phone's id, then "#" and when that day starts.
    private static func occurrence(_ id: String, in calendar: EKCalendar) -> EKEvent? {
        let parts = id.split(separator: "#", maxSplits: 1).map(String.init)
        guard parts.count == 2, let start = ISO8601DateFormatter().date(from: parts[1]) else {
            return store.calendarItem(withIdentifier: id) as? EKEvent
        }
        let around = store.predicateForEvents(withStart: start.addingTimeInterval(-86_400), end: start.addingTimeInterval(86_400),
                                              calendars: [calendar])
        return store.events(matching: around).first { occurrenceId($0) == id }
    }

    /// Sets the details Sprig sent: title, location, notes, and all day with its start and end.
    private static func set(_ event: EKEvent, _ changes: [String: Any]) throws {
        if let title = changes["title"] as? String { event.title = title }
        if changes.keys.contains("location") { event.location = changes["location"] as? String }
        if changes.keys.contains("notes") { event.notes = changes["notes"] as? String }
        guard let start = changes["start"] as? String, let end = changes["end"] as? String else { return }
        let allDay = changes["allDay"] as? Bool ?? event.isAllDay
        event.isAllDay = allDay
        if allDay {
            // Days: the end is the day after the last, and EventKit wants the last day.
            guard let first = day(start), let after = day(end) else { throw EditError.badTime }
            event.startDate = first
            event.endDate = max(first, after.addingTimeInterval(-1))
        } else {
            guard let from = instant(start), let to = instant(end) else { throw EditError.badTime }
            event.startDate = from
            event.endDate = to
        }
    }

    private static func instant(_ s: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    private static func day(_ s: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: s)
    }

    enum EditError: LocalizedError {
        case noCalendar, readOnly, notFound, badTime
        var errorDescription: String? {
            switch self {
            case .noCalendar: return "That calendar isn't on this phone any more"
            case .readOnly: return "That calendar can't be changed on this phone"
            case .notFound: return "That event isn't on this phone any more"
            case .badTime: return "That time couldn't be read"
            }
        }
    }

    /// An occurrence's id as Sprig knows it: every day of a repeat shares the phone's id; its start tells them apart.
    private static func occurrenceId(_ e: EKEvent) -> String? {
        guard let start = e.startDate, let id = e.calendarItemIdentifier as String? else { return nil }
        return String("\(id)#\(ISO8601DateFormatter().string(from: start))".prefix(400))
    }

    /// One occurrence as the server takes it; nil for one it can't place.
    private static func json(_ e: EKEvent) -> [String: Any]? {
        guard let start = e.startDate, let end = e.endDate, let id = occurrenceId(e) else { return nil }
        let iso = ISO8601DateFormatter()
        // An all-day event ends at the start of its last day, or the next; the server wants the day after.
        let day = DateFormatter()
        day.calendar = Calendar(identifier: .gregorian)
        day.timeZone = .current
        day.dateFormat = "yyyy-MM-dd"
        let allDayEnd = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: end.addingTimeInterval(-1)))!
        return [
            "calendarId": e.calendar.calendarIdentifier,
            "id": id,
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
        PhoneCalendarSync.askToBeWoken()
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
        if PhoneCalendarSync.setup != nil { PhoneCalendarSync.askToBeWoken() }
        sync(call)
    }

    /// Stops sharing from this phone (signing out, or turned off in Settings).
    @objc func stop(_ call: CAPPluginCall) {
        PhoneCalendarSync.setup = nil
        PhoneCalendarSync.token = nil
        PhoneCalendarSync.wakeToken = nil
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
