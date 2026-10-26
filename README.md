# app-nutrition-courses

Application web mobile « Nutri Semaine » : scan nutritionnel des produits, carnet de recettes, planning de la semaine, liste de courses (export Courses U) et batch cooking.

En ligne : https://sds-sdis73.github.io/app-nutrition-courses/

## Contenu

- `index.html` : toute l'application (HTML, CSS et JavaScript, sans étape de build)
- `version.json` : version publiée, relue par l'app pour se recharger après une mise à jour
- `aliments.json` : valeurs nutritionnelles de 3 484 aliments, extraites de la table Ciqual 2025 de l'Anses (Licence Ouverte Etalab 2.0), pour 100 g : énergie, protéines, glucides, sucres, lipides, AG saturés, fibres, sel, calcium, fer, vitamine C
- `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` : installation sur l'écran d'accueil
- `supabase/functions/` : fonctions serveur déployées sur Supabase
  - `import-recipe` : import d'une recette depuis une URL (JSON-LD schema.org/Recipe)
  - `signup` : création d'un compte e-mail + mot de passe déjà validé

## Publier une mise à jour

1. Incrémenter `APP_VERSION` dans `index.html` **et** la même valeur dans `version.json`.
2. Pousser sur `main` : GitHub Pages publie en 1 à 2 minutes et les téléphones se rechargent automatiquement.

Les fonctions de `supabase/functions/` se déploient séparément sur le projet Supabase (`supabase functions deploy <nom>`).
