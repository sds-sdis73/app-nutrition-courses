import SwiftUI

struct ContentView: View {
    @EnvironmentObject var model: PairingModel

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Envoie automatiquement vos pas et calories d'Apple Santé vers Nutri Semaine — Apple Watch et toute montre reliée à Santé (Garmin, Polar, Suunto, Xiaomi, Huawei, Coros…).")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("État") {
                    if model.importURL == nil {
                        Text("Non appairé. Dans Nutri Semaine : Paramètres › Montres & activité › « Lier cet iPhone ».")
                    } else {
                        Label("Appairé", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                        Text(model.lastResult.isEmpty ? "Aucun envoi pour l'instant." : model.lastResult).font(.footnote)
                        Button("Envoyer maintenant") { Task { await Sync.runIfPaired(); model.lastResult = UserDefaults.standard.string(forKey: "lastResult") ?? "" } }
                        Button("Autoriser l'accès à Santé") { Task { await Health.requestAuthorization() } }
                    }
                }
                Section("Appairage manuel") {
                    TextField("https://…/import-activite?t=…", text: $model.manual).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Enregistrer") { model.saveManual() }
                }
            }
            .navigationTitle("Compagnon")
        }
    }
}
