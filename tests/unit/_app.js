// Charge le script de index.html dans un bac à sable Node (sans navigateur) et expose les fonctions de calcul.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

const noop = () => {};
const el = () => ({
  addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], append: noop, remove: noop,
  setAttribute: noop, getAttribute: () => null, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, style: {}, dataset: {},
  innerHTML: '', textContent: '', focus: noop, click: noop, closest: () => null, getBoundingClientRect: () => ({ left: 0, right: 0, width: 0, height: 0 }),
});
const storage = new Map();
const localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k), clear: () => storage.clear(), key: (i) => [...storage.keys()][i], get length() { return storage.size; } };
const FILES = ['aliments.json', 'plats.json'];
const fetch = async (url) => {
  const name = String(url).split('?')[0];
  if (FILES.includes(name)) return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8')) };
  throw new Error(`réseau désactivé dans les tests unitaires : ${url}`);
};
const db = { auth: { onAuthStateChange: noop, signInWithPassword: async () => ({}) }, from: () => { throw new Error('base de données indisponible dans les tests unitaires'); }, functions: { invoke: async () => ({}) }, rpc: async () => ({}), storage: {} };
const document = { ...el(), body: el(), documentElement: el(), head: el(), title: '', hidden: false, visibilityState: 'visible', createElement: el };
const sandbox = {
  console, document, localStorage, fetch, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop, requestAnimationFrame: noop,
  navigator: { onLine: true, userAgent: 'node-test', language: 'fr', vibrate: noop }, location: { search: '', hash: '', pathname: '/', origin: 'http://test', href: 'http://test/', replace: noop },
  history: { replaceState: noop }, crypto: require('node:crypto').webcrypto, matchMedia: () => ({ matches: false }), addEventListener: noop, removeEventListener: noop,
  supabase: { createClient: () => db }, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, Intl, structuredClone, performance, innerWidth: 390, innerHeight: 844, scrollTo: noop,
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const NAMES = ['state', 'CQ', 'PL', 'needs', 'kcalNeed', 'bmrOf', 'ageOf', 'computedKcal', 'expense', 'waterGoal', 'waterTotal', 'waterDay', 'fmtL', 'dayCriteria', 'matchScore', 'nutriScore', 'computeScore', 'scoreLevel', 'offPer100', 'parseIngredientLine', 'ingGrams', 'guessAisle', 'recipeNutrition', 'recipeNutriScore', 'portionN', 'lateAfter', 'plusMin', 'periodOf', 'scaleN', 'addN', 'zeroN', 'memberDay', 'buildShopping', 'computeBatch', 'MET', 'MET_CATS', 'PLAT_CATS', 'isoDate', 'addDays', 'mondayOf', 'isoToDate', 'blankRecipe', 'detectAction', 'fmtNum', 'NUTRI_KEYS', 'REF_KCAL', 'ACTIVITY', 'OBJECTIF', 'SLOTS', 'SLOT_TIME', 'WATER_POINTS', 'store', 'Queue', 'APP_VERSION', 'companionOf', 'mealServings', 'restesFor', 'dayIndex', 'FRIANDISES', 'ACCESSOIRES', 'FONDS', 'parseMeal', 'weightTrend', 'weightAdvice', 'nlpFind'];
vm.runInContext(`${scripts.join('\n')}\n;globalThis.__app = { ${NAMES.join(', ')} };`, sandbox, { filename: 'index.html(script)' });
const app = sandbox.__app;

// Tables chargées une fois pour toute la session de tests.
app.ready = (async () => { await app.CQ.load(); await app.PL.load(); return app; })();

// Profils types réutilisés par les tests.
app.profiles = {
  homme: { id: 'm1', nom: 'Antoine', sexe: 'H', naissance: '1990-05-10', poids_kg: 80, taille_cm: 180, activite: 'modere', objectif: 'maintien' },
  femme: { id: 'm2', nom: 'Julie', sexe: 'F', naissance: '1992-03-02', poids_kg: 62, taille_cm: 165, activite: 'leger', objectif: 'maintien' },
  enfant: { id: 'm3', nom: 'Léa', sexe: 'F', naissance: '2018-09-15', poids_kg: 26, taille_cm: 125, activite: 'modere', objectif: 'maintien' },
  ado: { id: 'm4', nom: 'Tom', sexe: 'H', naissance: '2011-01-20', poids_kg: 55, taille_cm: 168, activite: 'actif', objectif: 'maintien' },
};
// Date de référence des tests (un mercredi) ; l'état est positionné sur sa semaine.
app.today = app.isoToDate('2026-10-28');
app.state.week = app.mondayOf(app.today);
app.state.day = app.today;

module.exports = app;
