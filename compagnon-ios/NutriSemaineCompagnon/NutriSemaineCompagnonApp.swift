import SwiftUI
import BackgroundTasks

/// Application compagnon iOS : lit Apple Santé (pas, énergie active et au repos, minutes d'exercice, distance)
/// et envoie chaque jour les totaux d'hier et d'aujourd'hui à l'adresse d'import personnelle de Nutri Semaine.
/// Appairage en un tap depuis l'app web : nutrisemaine://pair?t=JETON
@main
struct NutriSemaineCompagnonApp: App {
    @StateObject private var model = PairingModel()

    init() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Sync.taskId, using: nil) { task in
            Sync.handle(task: task as! BGAppRefreshTask)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView().environmentObject(model)
                .onOpenURL { url in model.handle(url: url) }
                .onAppear { Sync.scheduleNext(); Task { await Sync.runIfPaired() } }
        }
    }
}
