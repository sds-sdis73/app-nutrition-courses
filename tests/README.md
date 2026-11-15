# Tests automatisés

Deux niveaux :

- **Unitaires** (`tests/unit/`) : la page est assemblée en mémoire depuis `src/` (cœur et tous les modules) ; les fonctions de calcul (besoins, dépense, hydratation, critères du jour, recherche Ciqual et plats, Nutri-Score, ingrédients, liste de courses) sont chargées dans Node sans navigateur. Rapides, sans réseau.
- **Bout en bout** (`tests/e2e/`) : Chrome piloté par `playwright-core` en émulation iPhone 13, sur un serveur local, avec un **compte Supabase dédié**. Chaque scénario repart d'une semaine remise à zéro, à une date figée (mercredi 28 octobre 2026, 12 h 05 sauf mention). Open Food Facts, Open Prices et les fonctions serveur optionnelles reçoivent des réponses fixes (`tests/fixtures/`).

## Lancer

```sh
npm install            # une fois (playwright-core)
cp tests/.env.example tests/.env   # puis renseigner TEST_EMAIL / TEST_PASSWORD
npm test               # tout
npm run test:unit      # unitaires seulement
npm run test:e2e       # bout en bout seulement
node tests/run.js --grep Journal   # un scénario ou un test par son nom
node tests/run.js --headed         # voir le navigateur
```

Variables (dans `tests/.env` ou l'environnement) : `TEST_EMAIL`, `TEST_PASSWORD`, `CHROME_PATH` (défaut : Google Chrome sur macOS), `BASE_URL` (facultatif ; sans lui, le lanceur sert la copie courante du dépôt sur un **port libre** ; un port déjà occupé n'est jamais réutilisé), `E2E_LOCK` (défaut `/tmp/tt-e2e.lock`), `E2E_LOCK_WAIT_MIN` (défaut 90).

Le lanceur réassemble d'abord `index.html` depuis `src/`. Les scénarios de bout en bout partagent le compte de test : un **verrou** (`mkdir /tmp/tt-e2e.lock`, avec le pid et le dossier du propriétaire) fait attendre une seconde copie du dépôt jusqu'à la fin de la première ; un verrou dont le processus a disparu est repris. Dans un worktree, copier `tests/.env` du dépôt principal.

Tables pas encore créées en production : `tests/e2e/pg-mock.js` simule PostgREST en mémoire pour une liste de tables (`installPgMock(page, { tables, keys, seed, defaults })`, `realTableExists(page, table)`) ; `forme-mock.js` s'en sert pour le module Forme.

Le compte de test est `test-auto@nutri-semaine.test` ; le lanceur crée ses données de départ (3 membres, 3 recettes, un compagnon) s'il les trouve absentes. Les comptes de démonstration `essai-a` / `essai-b` ne sont jamais touchés.

Les captures des échecs sont dans `tests/.out/`.

## Limites connues (non couvertes)

- Caméra et notifications push : le scanner est remplacé par un stub (`Scanner.open`), les rappels ne sont pas envoyés.
- Les prix Courses U (`prix-coursesu`) et l'import de recette (`import-recipe`) sont simulés.
- L'import de données (`importData`) ne réinitialise pas le champ fichier ; les liens importés sans `onConflict` peuvent échouer en cas de doublon.
- Les textes des rappels (« Samedi 18 h ») et les horaires internes du fil (`SLOT_TIME`, `WATER_POINTS`) sont fixes.
- Hors ligne, les articles libres de la liste de courses et les cases cochées ne sont pas mis en file d'attente.
