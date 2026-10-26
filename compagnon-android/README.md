# Nutri Semaine Compagnon (Android)

Petite application Android qui lit Health Connect (pas, calories actives et totales, distance, minutes d'exercice) et les envoie
toutes les 6 heures à l'adresse d'import personnelle de Nutri Semaine. Fonctionne avec toutes les montres dont l'application
écrit dans Health Connect : Samsung Health, Garmin Connect, Google Health (Fitbit, Pixel), Zepp (Xiaomi/Amazfit), Huawei Health,
Suunto, Coros, Polar Flow, Oura…

## Appairage sans saisie
Dans l'app web : Paramètres › Montres & activité › « Lier ce téléphone Android ». Le lien `nutrisemaine://pair?t=JETON`
ouvre le compagnon avec le jeton, qui demande alors les autorisations Health Connect et planifie l'envoi.

## Compiler
1. Installer Android Studio (Ladybug ou plus récent) et ouvrir ce dossier.
2. Build › Generate Signed Bundle / APK (ou `./gradlew assembleRelease` après `gradle wrapper`).
3. Installer l'APK sur le téléphone (ou publier sur le Play Store ; la lecture Health Connect en arrière-plan
   nécessite la déclaration des autorisations santé lors de la publication).
