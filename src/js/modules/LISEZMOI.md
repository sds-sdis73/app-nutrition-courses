# Modules de Tribu & Toutous

Un module = **un fichier `src/js/modules/<id>.js`** (et, s'il a des styles, `src/css/modules/<id>.css`).
L'assembleur (`npm run build`, `tools/assemble.js`) place les modules **après le cœur** (`src/js/00-…` à `89-…`),
dans l'ordre alphabétique, **chacun enveloppé dans sa propre fonction** : ses `const` et `function` restent privés,
deux modules peuvent utiliser les mêmes noms sans conflit. Le démarrage (`src/js/90-demarrage.js`) vient ensuite :
la barre d'onglets est construite une fois tous les modules enregistrés.

Ce qui doit être visible ailleurs passe **uniquement** par `Modules.register(…)` (actions, exposes, sources).
Ne pas toucher aux fichiers du cœur pour un module : si un point d'extension manque, le signaler.

## Modules.register(def) → def normalisée

| Champ | Type | Rôle |
|---|---|---|
| `id` | `string` (`/^[a-z][a-z0-9-]*$/`) | Identifiant unique, **égal au nom du fichier**. C'est aussi l'identifiant d'écran : `state.tab === id`, lien direct `#id`, `switchTab(id)`. |
| `onglet` | `'accueil' \| 'famille' \| 'cuisine' \| 'forme' \| 'plus'` | Onglet où l'écran est rangé. |
| `segment` | `string` | Libellé court dans la barre de segments de l'onglet (ou ligne du menu Plus). Sans `segment`, l'écran n'apparaît dans aucun menu (sous-écran ouvert par `switchTab`). |
| `ordre` | `number` (défaut 100) | Position du segment dans l'onglet. |
| `libelle` | `string \| () => string` | Titre de l'en-tête (`#title`) quand l'écran est affiché. |
| `icone` | `string` (SVG) | Icône (menu Plus). Utiliser `I('<path …/>')` ou `ICON.xxx`. |
| `description` | `string` | Sous-titre dans le menu Plus. |
| `rendu` | `() => string` (HTML) | Contenu de l'écran ; appelé à chaque `render()`. Doit être rapide et synchrone : charger les données dans `charger`. |
| `ouvrir` | `() => void` | Au lieu d'un écran : action au toucher dans le menu Plus (ex. ouvrir une feuille). |
| `actions` | `{ [nom]: (bouton, evenement) => void }` | Fusionnées dans `ACTIONS` : tout élément `data-act="nom"` les déclenche. **Préfixer par l'id** (`agenda-ajouter`) ; un nom déjà pris lève une erreur. |
| `charger` | `async (force: boolean, ctx: { horsLigne: boolean }) => void` | Chargement des données : au démarrage de la session (après les données du cœur) et au retour du réseau. Hors ligne : relire le cache (`Modules.cache(id)`). Une erreur est journalisée sans bloquer les autres modules. |
| `tables` | `{ [cle]: 'nom_table' }` | Ajoutées à `T` ; seules les tables déclarées sont acceptées par `Sync` (file hors ligne). |
| `expose` | `{ [nom]: fonction pure }` | Pour les tests unitaires : `app.modules.<id>.<nom>` dans `tests/unit/_app.js`. |
| `sourcesAccueil` | `(ctx) => Element[] \| Promise<Element[]>` | **Fil de l'Accueil** (voir plus bas). |
| `agenda` | `(debut: Date, fin: Date) => ElementAgenda[] \| Promise<…>` | **Éléments datés montrés dans l'agenda** (voir plus bas). |
| `ajoutRapide` | `Analyseur \| Analyseur[]` | **Bouton « + »** (voir plus bas). |
| `notifications` | `[{ type, libelle, description?, defaut?: true }]` | Types de notifications que le module peut envoyer (pour l'écran Notifications). |
| `masquable` | `boolean` | L'écran peut être masqué dans Plus › Affichage (comme le batch cooking). |
| `visible` | `() => boolean` | Condition d'affichage supplémentaire. |

Un champ inconnu lève une erreur (faute de frappe repérée tout de suite).

### Autres fonctions du registre

- `Modules.get(id)` → définition ou `null` ; `Modules.vues(onglet)` → écrans visibles de l'onglet, dans l'ordre.
- `Modules.exposes()` → `{ id: expose }` ; `Modules.notifications()` → `[{ module, type, libelle, defaut }]`.
- `Modules.cache(id)` → `{ get(cle, defaut), set(cle, valeur) }` : cache local par foyer (lecture hors ligne).
- `Modules.bientot(titre, texte?, htmlEnPlus?)` → écran « Bientôt ici ».
- `Modules.masquer(id, oui)`, `Modules.masques()`, `Modules.visible(def)`.
- `Nav.resoudre(cible)` : onglet ou écran → écran à afficher ; `switchTab(cible)` l'affiche.

### Écrire dans Supabase : `Sync`

- `await Sync.upsert(table, ligne, { onConflict = 'id' })` → ligne enregistrée. Ajoute `foyer_id`, `user_id` (`own()`) et un `id` si absent. En cas de coupure réseau, l'écriture part dans la file d'attente (rejouée au retour du réseau) et la ligne locale est renvoyée.
- `await Sync.supprimer(table, id)` : même principe.
- La lecture se fait directement : `const { data, error } = await db.from(T.ma_table).select('*').eq('foyer_id', foyer())`.

## Points d'extension partagés

### (a) Fil de l'Accueil : `Accueil.sources`

```js
sourcesAccueil: (ctx) => [{ heure: '14:00', titre: 'Judo', detail: 'Zoé · gymnase', icone: ICON.clock, act: 'tab', data: { tab: 'agenda' }, priorite: 1 }]
```
- `ctx = { date: Date, iso: 'AAAA-MM-JJ', membre: membre courant | null, famille: boolean }` (`famille` : fil de toute la famille).
- `heure` : `'HH:MM'` ou `null` (sans heure : en fin de fil). `act` + `data` : bouton `data-act` (les clés de `data` deviennent des `data-…`).
- Le module accueil-famille lit le tout par `await Accueil.elements(ctx)` → éléments triés par heure, chacun avec `module`.

### (b) Bouton « + » : `AjoutRapide.analyseurs`

Le « + » de l'en-tête ouvre une phrase libre. Chaque analyseur propose une interprétation ; la meilleure est en tête.
Les 5 types, dans l'ordre : `evenement`, `tache`, `article`, `repas`, `seance` (`AjoutRapide.TYPES`).
Le cœur fournit déjà `article` (courses), `repas` (journal) et `seance` (ouvre Forme). Un type sans analyseur reste grisé (« Bientôt ici »).

```js
ajoutRapide: {
  type: 'evenement',                       // un des 5 types
  libelle: 'Événement',                    // facultatif
  analyser(texte, ctx) {                   // ctx = { maintenant: Date, membre, membres }
    const p = analysePhrase(texte, { maintenant: ctx.maintenant, membres: ctx.membres });
    if (!p.date) return null;              // ou { score: 0..1, resume, donnees }
    return { score: p.heure ? 0.9 : 0.6, resume: `${p.texte} · ${p.date}`, donnees: p };
  },
  async enregistrer(donnees, ctx) { …; return 'Événement ajouté'; },  // facultatif : enregistrement en un geste
  ouvrir(texte, ctx) { … },                // obligatoire : formulaire complet prérempli
}
```
`analysePhrase(texte, { maintenant, membres })` (cœur, fonction pure) → `{ date: 'AAAA-MM-JJ' | null, heure: 'HH:MM' | null, membres: [id], texte }`
comprend « aujourd'hui, demain, après-demain, ce soir, mercredi (prochain), 12/11, le 3 novembre, 14 h, 9h30 » et les prénoms du foyer.
`sansAccents(s)` aide aux comparaisons.

### (c) Agenda : `Agenda.sources`

```js
agenda: (debut, fin) => [{ id: 'rdv:42', date: '2026-11-18', heure: '09:30', heureFin: '10:00', titre: 'Pédiatre', detail: 'Zoé', membres: [idZoe], couleur: null, act: 'carnet-rdv', data: { id: 42 } }]
```
Le module agenda lit le tout par `await Agenda.elements(debut, fin)` → éléments de la période, triés, chacun avec `source` (id du module).
Le cœur y met déjà les repas du planning chargé (`source: 'planning'`).
Le module agenda garde ces éléments 5 s en mémoire : un module dont les éléments changent (agenda importé, synchro iCloud)
augmente `Agenda.version` pour qu'ils soient relus au prochain affichage.

### (d) Entre modules (ajouts de l'intégration)

- **Bouton de type du « + »** : `AjoutRapide.pour(type)` rend l'analyseur enregistré **en dernier** pour ce type ; un module passe donc devant le cœur (ex. `article` de cuisine-mc).
- **Tâches** : `window.Taches.creer({ titre, echeance, notes, responsable, origine, origine_id })` crée une tâche sans doublon (même `origine` + `origine_id`). Le carnet s'en sert pour ses échéances à J-7.
- **Notifications liées à une action** : `Modules.get('notifications').expose.programmer({ id, type, titre, corps, url, pour_membres | pour_users, sauf_auteur, envoyer_a })`.
  Utiliser les types de l'écran Notifications (`taches`, `messages`, `agenda_modifs`, `courses_modif`…) plutôt que d'en déclarer de nouveaux qui feraient doublon.
- **Éléments d'Accueil et d'agenda** : champs facultatifs `membres: [member_id]` (couleurs et filtre) et `trajet: { sens, qui, pour }` (briefing du soir).
- **Partage d'outils entre deux écrans d'un même module** : `Modules.get(id).service` (messages et photos).


## Exemple de module minimal

`src/js/modules/exemple.js` :

```js
// Module « Exemple » : une liste de notes du foyer.
const cache = Modules.cache('exemple');
let notes = [];

const ligne = (n) => `<li>${esc(n.texte)} <button class="btn small" data-act="exemple-suppr" data-id="${n.id}">Retirer</button></li>`;
const resume = (liste) => `${liste.length} note${liste.length > 1 ? 's' : ''}`; // fonction pure, testée

Modules.register({
  id: 'exemple',
  onglet: 'famille',
  segment: 'Notes',
  ordre: 60,
  libelle: 'Notes du foyer',
  tables: { notes_foyer: 'notes_foyer' },
  async charger(force, { horsLigne }) {
    if (horsLigne) { notes = cache.get('notes', []); return; }
    const { data, error } = await db.from(T.notes_foyer).select('*').eq('foyer_id', foyer()).order('created_at');
    if (error) throw error;
    notes = data;
    cache.set('notes', notes);
  },
  rendu: () => `<section class="card" style="padding:14px"><p class="muted">${resume(notes)}</p><ul>${notes.map(ligne).join('')}</ul>
    <button class="btn primary" data-act="exemple-ajouter">Ajouter</button></section>`,
  actions: {
    'exemple-ajouter': async () => { try { notes.push(await Sync.upsert(T.notes_foyer, { texte: 'Nouvelle note' })); render(); } catch (e) { fail(e); } },
    'exemple-suppr': async (b) => { try { await Sync.supprimer(T.notes_foyer, b.dataset.id); notes = notes.filter((n) => n.id !== b.dataset.id); render(); } catch (e) { fail(e); } },
  },
  sourcesAccueil: () => (notes.length ? [{ heure: null, titre: resume(notes), act: 'tab', data: { tab: 'exemple' } }] : []),
  expose: { resume },
});
```

Test unitaire (`tests/unit/exemple.test.js`) : `const app = require('./_app'); app.modules.exemple.resume([1, 2]) === '2 notes'`.

## Règles communes

- **Fichiers** : un module ne modifie que `src/js/modules/<id>.js`, `src/css/modules/<id>.css`, ses tests (`tests/unit/<id>.test.js`, `tests/e2e/NN-<id>.spec.js`), sa migration `supabase/migrations/2026-11-16_<id>.sql` et ses fonctions `supabase/functions/<nom>/`.
- **CSS** : préfixer les classes par l'id du module (`.agenda-…`) ; utiliser les jetons (`var(--primary)`, `var(--ink)`, `var(--surface)`…) pour suivre l'univers graphique.
- **Textes** : français avec accents, tutoiement, comme le reste de l'appli.
- **Données** : tables par foyer (`foyer_id = (select mon_foyer())`), données personnelles en RLS propriétaire (`user_id = auth.uid()`). Migration idempotente (`create table if not exists`…), jamais exécutée sur la production par l'agent.
- **Tests de bout en bout** : pour une table pas encore créée en production, `tests/e2e/pg-mock.js` (`installPgMock(page, { tables, keys, seed })`, et `realTableExists(page, table)` pour s'en passer quand la migration est appliquée). `npm test` prend un verrou (`/tmp/tt-e2e.lock`) : deux copies du dépôt n'utilisent jamais le compte de test en même temps. Sans `BASE_URL`, la copie courante est servie sur un port libre.
- **Aides du cœur** utilisables partout : `$`, `$$`, `esc`, `toast`, `fail`, `openSheet`, `sheetHead`, `closeSheet`, `confirmSheet`, `render`, `switchTab`, `state`, `store`, `db`, `T`, `own`, `uid`, `me`, `foyer`, `memberById`, `isoDate`, `isoToDate`, `addDays`, `mondayOf`, `ICON`, `I`, `Sync`, `analysePhrase`, `sansAccents`, `isNetworkError`.
