import Foundation
import Combine

/// Jeton d'import mémorisé et état du dernier envoi.
final class PairingModel: ObservableObject {
    static let importBase = "https://svugddkrptqpjmywhorb.supabase.co/functions/v1/import-activite?t="
    @Published var importURL: String? = UserDefaults.standard.string(forKey: "importUrl") { didSet { UserDefaults.standard.set(importURL, forKey: "importUrl") } }
    @Published var lastResult: String = UserDefaults.standard.string(forKey: "lastResult") ?? ""
    @Published var manual: String = ""

    func handle(url: URL) {
        guard url.scheme == "nutrisemaine", url.host == "pair",
              let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "t" })?.value,
              token.range(of: "^[A-Za-z0-9_-]{20,64}$", options: .regularExpression) != nil else { return }
        importURL = Self.importBase + token
        Task { await Health.requestAuthorization(); await Sync.runIfPaired() }
    }

    func saveManual() {
        let raw = manual.trimmingCharacters(in: .whitespaces)
        let token: String?
        if let r = raw.range(of: "[?&]t=([A-Za-z0-9_-]{20,64})", options: .regularExpression) {
            token = String(raw[r]).components(separatedBy: "t=").last
        } else if raw.range(of: "^[A-Za-z0-9_-]{20,64}$", options: .regularExpression) != nil { token = raw } else { token = nil }
        guard let t = token else { lastResult = "Adresse non reconnue"; return }
        importURL = Self.importBase + t
        Task { await Health.requestAuthorization(); await Sync.runIfPaired() }
    }
}
