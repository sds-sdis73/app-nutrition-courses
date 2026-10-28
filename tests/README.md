# Tests automatisés

Deux niveaux :

- **Unitaires** (`tests/unit/`) : les fonctions de calcul de `index.html` (besoins, dépense, hydratation, critères du jour, recherche Ciqual et plats, Nutri-Score, ingrédients, liste de courses) sont chargées dans Node sans navigateur. Rapides, sans réseau.
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

Variables (dans `tests/.env` ou l'environnement) : `TEST_EMAIL`, `TEST_PASSWORD`, `CHROME_PATH` (défaut : Google Chrome sur macOS), `BASE_URL` (défaut : `http://127.0.0.1:8767/`, serveur lancé par le lanceur).

Le compte de test est `test-auto@nutri-semaine.test` ; le lanceur crée ses données de départ (3 membres, 3 recettes, un compagnon) s'il les trouve absentes. Les comptes de démonstration `essai-a` / `essai-b` ne sont jamais touchés.

Les captures des échecs sont dans `tests/.out/`.

## Limites connues (non couvertes)

- Caméra et notifications push : le scanner est remplacé par un stub (`Scanner.open`), les rappels ne sont pas envoyés.
- Les prix Courses U (`prix-coursesu`) et l'import de recette (`import-recipe`) sont simulés.
- L'import de données (`importData`) ne réinitialise pas le champ fichier ; les liens importés sans `onConflict` peuvent échouer en cas de doublon.
- Les textes des rappels (« Samedi 18 h ») et les horaires internes du fil (`SLOT_TIME`, `WATER_POINTS`) sont fixes.
- Hors ligne, les articles libres de la liste de courses et les cases cochées ne sont pas mis en file d'attente.
