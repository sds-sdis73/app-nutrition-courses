# app-nutrition-courses

Application web mobile « Miam & moi » (logo : bulle « M&m ») : scan nutritionnel des produits, carnet de recettes, planning de la semaine, liste de courses (export Courses U) et batch cooking.

En ligne : https://sds-sdis73.github.io/app-nutrition-courses/

## Contenu

- `index.html` : toute l'application (HTML, CSS et JavaScript, sans étape de build)
- `sw.js` : service worker (ouverture hors ligne, cache des fichiers de l'app, réception des notifications)
- `version.json` : version publiée, relue par l'app pour se recharger après une mise à jour
- `aliments.json` : valeurs nutritionnelles de 3 484 aliments, extraites de la table Ciqual 2025 de l'Anses (Licence Ouverte Etalab 2.0), pour 100 g : énergie, protéines, glucides, sucres, lipides, AG saturés, fibres, sel, calcium, fer, vitamine C
- `plats.json` : 566 plats (petit-déjeuner, plats, sandwichs et burgers, pizzas, salades, soupes, desserts…) avec une portion type et les valeurs pour 100 g : plats issus de Ciqual 2025 et plats du quotidien calculés à partir d'ingrédients Ciqual (bo bun, poke bowl, burger maison…)
- `tests/` : suite de tests automatisés (voir ci-dessous) ; `tools/build-plats.py` : génération de `plats.json`
- `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` : installation sur l'écran d'accueil
- `supabase/functions/` : fonctions serveur déployées sur Supabase
  - `import-recipe` : import d'une recette depuis une URL (JSON-LD schema.org/Recipe)
  - `signup` : création d'un compte e-mail + mot de passe déjà validé
  - `join-foyer` : rattachement d'un compte à un foyer par code d'invitation
  - `reset-password` : nouveau mot de passe défini par un administrateur du foyer (pas d'e-mail)
  - `send-reminders` : rappels push (appelée toutes les heures par `pg_cron`)
  - `prix-coursesu` : tentative de lecture d'un prix sur coursesu.com (le site bloque souvent ; repli sur Open Prices)

## Widget iPhone

`widget/miam-et-moi.js` est un script pour l'app gratuite **Scriptable** (aucune publication sur l'App Store). Il affiche le compagnon, les calories, l'eau et l'activité du jour, avec les boutons Noter (ouvre l'app avec `?action=noter`) et +250 ml (enregistré directement par le widget). Le mode d'emploi est dans l'app : Paramètres › Widget iPhone. Les calories viennent de la table `resume_jour`, mise à jour par l'app à chaque affichage de l'accueil.

Adresses d'action reconnues par l'app : `?action=noter`, `?action=eau`, `?action=activite`, `?action=peser`.

## Tests

`npm install` puis `npm test` : tests unitaires (fonctions de calcul chargées dans Node) et scénarios de bout en bout (Chrome piloté par playwright-core, compte Supabase dédié, date figée, réponses réseau fixes). Détails, variables et limites dans `tests/README.md`. La base de plats se régénère avec `python3 tools/build-plats.py aliments.json plats.json`.

## Publier une mise à jour

1. Incrémenter `APP_VERSION` dans `index.html` **et** la même valeur dans `version.json`.
2. Pousser sur `main` : GitHub Pages publie en 1 à 2 minutes et les téléphones se rechargent automatiquement.

Les fonctions de `supabase/functions/` se déploient séparément sur le projet Supabase (`supabase functions deploy <nom>`).

## Données

Tables Supabase (toutes protégées par RLS, partagées par foyer) : `foyers`, `foyer_comptes`, `foyer_membres`, `recettes`, `planning_repas`, `restes`, `placards`, `historique_scans`, `liens_produits`, `courses_coches`, `courses_ajouts`, `journal`, `activites`, `hydratation`, `compagnons`, `bilans`, `pesees` (suivi du poids), `resume_jour` (résumé pour le widget) — ces deux tables se créent avec `supabase/migrations/2026-10-28_pesees_resume_jour.sql` —, `gains` (coquillages gagnés, un par membre/jour/clé via la fonction SQL `gagner`), `aliments_favoris`, `produits_perso`, `reglages`, `push_abonnements`, `rappels_envoyes`, `config_app` (clés VAPID, service role uniquement).

Sources externes : Open Food Facts (produits, alternatives), Open Prices (prix moyens par code-barres), table Ciqual 2025 de l'Anses (aliments génériques).

## Activités et hydratation

Saisie manuelle uniquement (pas de synchronisation de montre), parmi environ 70 activités classées par catégorie (CrossFit, HIIT, sports collectifs, raquettes, glisse…) : chaque activité a une heure et un statut « prévue » ou « faite » ; seules les activités faites comptent dans la dépense (métabolisme de base × 1,2 + MET × poids × durée). L'eau se note par verre, tasse ou bouteille (table `hydratation`) ; l'objectif suit les repères EFSA, augmenté de 500 ml par heure d'activité, ou la valeur saisie pour le membre.

L'écran Aujourd'hui présente la journée du membre choisi sous forme de fil chronologique : repas (petit-déjeuner, déjeuner, goûter, dîner, collations), points d'hydratation, activités, rappels de restes et bilan du soir, avec un repère « maintenant », sans horaires affichés (chacun mange à son rythme).
