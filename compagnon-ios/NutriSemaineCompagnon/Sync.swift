import Foundation
import BackgroundTasks

/// Envoi des deux derniers jours ; relancé par iOS en arrière-plan (BGAppRefresh) et à chaque ouverture.
enum Sync {
    static let taskId = "fr.nutrisemaine.compagnon.sync"

    static func scheduleNext() {
        let req = BGAppRefreshTaskRequest(identifier: taskId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 4 * 3600)
        try? BGTaskScheduler.shared.submit(req)
    }

    static func handle(task: BGAppRefreshTask) {
        scheduleNext()
        let work = Task { await runIfPaired(); task.setTaskCompleted(success: true) }
        task.expirationHandler = { work.cancel() }
    }

    @MainActor
    static func runIfPaired() async {
        guard let urlString = UserDefaults.standard.string(forKey: "importUrl"), let url = URL(string: urlString) else { return }
        let today = Date()
        let days = [await Health.dayPayload(Calendar.current.date(byAdding: .day, value: -1, to: today)!), await Health.dayPayload(today)]
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: days)
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            UserDefaults.standard.set("\(Self.now()) · HTTP \(code) \(String(data: data.prefix(120), encoding: .utf8) ?? "")", forKey: "lastResult")
        } catch {
            UserDefaults.standard.set("\(Self.now()) · erreur : \(error.localizedDescription)", forKey: "lastResult")
        }
    }

    private static func now() -> String { let f = DateFormatter(); f.dateFormat = "dd/MM HH:mm"; return f.string(from: Date()) }
}
