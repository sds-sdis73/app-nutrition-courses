// ---------------------------------------------------------------------------
// État global
// ---------------------------------------------------------------------------
const state = {
  user: null,
  foyer: null,
  compte: null,
  comptes: [],
  authMode: 'login',
  // Une seule fois : l'Accueil s'ouvre désormais sur la journée de la famille (« Aujourd'hui ») et non plus sur « Moi ».
  tab: (() => { const t = store.get('tab', 'accueil-famille'); if (store.get('accueil:v2', false)) return t; store.set('accueil:v2', true); store.set('vue:accueil', 'accueil-famille'); return t === 'aujourdhui' ? 'accueil-famille' : t; })(),
  offline: false,
  push: null,
  settings: { store_name: 'Drive Super U Cognin', store_slug: 'superu-cognin', default_servings: 2 },
  recipes: [],
  links: {},
  scans: [],
  week: mondayOf(new Date()),
  plan: [],
  checks: {},
  extras: [],
  members: [],
  journal: [],
  placards: [],
  restes: [],
  favoris: [],
  perso: [],
  activites: [],
  eau: [],
  compagnons: [],
  bilans: [],
  pesees: [],
  peseesOk: false,
  day: new Date(),
  suiviMember: store.get('suiviMember', null),
  suiviView: 'jour',
  recipeQuery: '',
  recipeChip: 'tous',
  scanFilter: 'tous',
  moving: null,
};
const recipeById = (id) => state.recipes.find((r) => r.id === id);

