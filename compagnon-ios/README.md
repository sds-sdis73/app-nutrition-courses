# Nutri Semaine Compagnon (iOS)

Application iOS (SwiftUI, HealthKit) qui envoie chaque jour pas, énergie active, énergie au repos, minutes d'exercice et distance
d'Apple Santé vers l'adresse d'import personnelle de Nutri Semaine. Couvre l'Apple Watch et toute montre dont l'app écrit dans Santé.

## Appairage sans saisie
Dans l'app web : Paramètres › Montres & activité › « Lier cet iPhone » ouvre `nutrisemaine://pair?t=JETON` : le compagnon
mémorise le jeton, demande l'accès à Santé et envoie immédiatement.

## Compiler (Mac + Xcode, compte développeur Apple requis pour HealthKit)
1. Xcode › File › New › Project › iOS App (SwiftUI), nom `NutriSemaineCompagnon`, bundle `fr.nutrisemaine.compagnon`.
2. Remplacer les fichiers générés par ceux de ce dossier ; ajouter la capability **HealthKit** (avec Background Delivery)
   et **Background Modes › Background fetch** ; vérifier que `Info.plist` contient les clés de ce dossier.
3. Déploiement cible iOS 16 ; Product › Run sur l'iPhone, ou Archive › TestFlight pour le foyer.
Sans compte développeur : utilisez le Raccourci iOS décrit dans l'app (Paramètres › Montres & activité).
