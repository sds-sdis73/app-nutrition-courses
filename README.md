# app-nutrition-courses

Application web mobile « Nutri Semaine » : scan nutritionnel des produits, carnet de recettes, planning de la semaine, liste de courses (export Courses U) et batch cooking.

En ligne : https://sds-sdis73.github.io/app-nutrition-courses/

## Contenu

- `index.html` : toute l'application (HTML, CSS et JavaScript, sans étape de build)
- `sw.js` : service worker (ouverture hors ligne, cache des fichiers de l'app, réception des notifications)
- `version.json` : version publiée, relue par l'app pour se recharger après une mise à jour
- `aliments.json` : valeurs nutritionnelles de 3 484 aliments, extraites de la table Ciqual 2025 de l'Anses (Licence Ouverte Etalab 2.0), pour 100 g : énergie, protéines, glucides, sucres, lipides, AG saturés, fibres, sel, calcium, fer, vitamine C
- `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` : installation sur l'écran d'accueil
- `supabase/functions/` : fonctions serveur déployées sur Supabase
  - `import-recipe` : import d'une recette depuis une URL (JSON-LD schema.org/Recipe)
  - `signup` : création d'un compte e-mail + mot de passe déjà validé
  - `join-foyer` : rattachement d'un compte à un foyer par code d'invitation
  - `reset-password` : nouveau mot de passe défini par un administrateur du foyer (pas d'e-mail)
  - `send-reminders` : rappels push (appelée toutes les heures par `pg_cron`)
  - `prix-coursesu` : tentative de lecture d'un prix sur coursesu.com (le site bloque souvent ; repli sur Open Prices)
  - `import-activite` : pont téléphone (Raccourci iOS, Tasker/Health Connect, Health Auto Export) — pas et calories du jour, authentifié par jeton
  - `oauth-montre` / `sync-montres` : connexion directe Polar, Withings, Oura, Strava et synchronisation horaire

## Publier une mise à jour

1. Incrémenter `APP_VERSION` dans `index.html` **et** la même valeur dans `version.json`.
2. Pousser sur `main` : GitHub Pages publie en 1 à 2 minutes et les téléphones se rechargent automatiquement.

Les fonctions de `supabase/functions/` se déploient séparément sur le projet Supabase (`supabase functions deploy <nom>`).

## Données

Tables Supabase (toutes protégées par RLS, partagées par foyer) : `foyers`, `foyer_comptes`, `foyer_membres`, `recettes`, `planning_repas`, `restes`, `placards`, `historique_scans`, `liens_produits`, `courses_coches`, `courses_ajouts`, `journal`, `aliments_favoris`, `produits_perso`, `reglages`, `push_abonnements`, `rappels_envoyes`, `config_app` (clés VAPID, service role uniquement).

Sources externes : Open Food Facts (produits, alternatives), Open Prices (prix moyens par code-barres), table Ciqual 2025 de l'Anses (aliments génériques).

## Montres connectées

- **Toutes marques via le téléphone** : l'app de la montre écrit dans Apple Santé (iPhone) ou Health Connect (Android). Un Raccourci iOS ou Tasker (plugin Health Connect) envoie chaque soir pas / calories à l'adresse personnelle fournie dans Paramètres › Montres & activité (fonction `import-activite`). Guides pas à pas dans l'app.
- **Connexion directe** (sans téléphone) : Polar, Withings, Oura (gratuit), Strava (abonnement Strava requis). Créer une application sur le portail du service avec l'URL de redirection `https://svugddkrptqpjmywhorb.supabase.co/functions/v1/oauth-montre/callback/<polar|withings|oura|strava>`, puis renseigner les secrets Edge `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET` (idem `WITHINGS_`, `OURA_`, `STRAVA_`) dans Supabase › Edge Functions › Secrets.
- Garmin (programme développeur fermé) et Fitbit (API arrêtée le 30/10/2026) passent par le pont téléphone. Import CSV possible pour les exports Garmin Connect, Samsung Health, Apple Santé, Lotus…
