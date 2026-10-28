// Aides communes aux tests de bout en bout : environnement, connexion, routes réseau fixes, remise à zéro des données.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');

// Lecture de tests/.env (TEST_EMAIL, TEST_PASSWORD, CHROME_PATH, BASE_URL).
function loadEnv() {
  const env = { ...process.env };
  const file = path.join(__dirname, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] == null) env[m[1]] = m[2];
    }
  }
  if (!env.TEST_EMAIL || !env.TEST_PASSWORD) throw new Error('tests/.env doit définir TEST_EMAIL et TEST_PASSWORD (voir tests/.env.example)');
  env.CHROME_PATH = env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  env.BASE_URL = env.BASE_URL || 'http://127.0.0.1:8767/';
  return env;
}

// Date figée de la suite : un mercredi à midi passé (fil de la journée déterministe).
const FIXED_DATE = '2026-10-21';
const FIXED_TIME = `${FIXED_DATE}T12:05:00`;

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

// Réponses fixes pour tout ce qui n'est pas Supabase : Open Food Facts, Open Prices, fonctions serveur optionnelles.
async function setupRoutes(page, overrides = {}) {
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route((url) => url.hostname === 'world.openfoodfacts.org', (route) => {
    const u = new URL(route.request().url());
    const m = u.pathname.match(/\/product\/(\d+)\.json/);
    if (m) {
      const file = path.join(FIXTURES, `off-${m[1]}.json`);
      return json(route, fs.existsSync(file) ? fixture(`off-${m[1]}.json`) : { status: 0, status_verbose: 'product not found' });
    }
    return json(route, { count: 0, page: 1, products: [] });
  });
  await page.route((url) => url.hostname === 'prices.openfoodfacts.org', (route) => json(route, { items: [], total: 0 }));
  await page.route((url) => /\/functions\/v1\/(import-recipe|prix-coursesu|send-reminders)$/.test(url.pathname), (route) => {
    const fn = route.request().url().split('/').pop();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    if (overrides[fn]) return json(route, overrides[fn]);
    if (fn === 'import-recipe') return json(route, fixture('import-recipe.json'));
    if (fn === 'prix-coursesu') return json(route, { price: null, reason: 'test' });
    return json(route, { ok: true, sent: 0 });
  });
  if (overrides.version) await page.route((url) => /version\.json/.test(url.pathname), (route) => json(route, { version: overrides.version }));
}

const waitLoaded = (page, timeout = 45000) => page.waitForFunction(() => window.__app_loaded?.() ?? false, null, { timeout });

// Les variables de l'app sont des const du script : on expose quelques accès via des fonctions globales installées avant le chargement.
async function installBridge(page) {
  await page.addInitScript(() => {
    window.__app_loaded = () => { try { return !!state.loaded; } catch { return false; } };
  });
}

async function closeSheets(page, n = 3) {
  for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(120); }
  await page.evaluate(() => { while (sheets.length) closeSheet(); });
  await page.waitForTimeout(350);
}

async function login(page, env) {
  await page.goto(env.BASE_URL, { waitUntil: 'networkidle' });
  if (await page.$('[data-form="auth"]')) {
    await page.fill('[data-form="auth"] [name="email"]', env.TEST_EMAIL);
    await page.fill('[data-form="auth"] [name="password"]', env.TEST_PASSWORD);
    await page.click('[data-form="auth"] button.primary');
  }
  await waitLoaded(page);
  await page.waitForTimeout(1200);
  await closeSheets(page);
}

// Données de départ du foyer de test, créées une seule fois (idempotent).
async function ensureSeed(page) {
  return page.evaluate(async () => {
    const out = {};
    if (!state.members.length) {
      const base = { evite: [], objectif_kcal_actives: 300, objectif_eau_ml: null, kcal_perso: null };
      await Data.saveMember({ ...base, nom: 'Antoine', sexe: 'H', naissance: '1990-05-10', poids_kg: 80, taille_cm: 180, activite: 'modere', objectif: 'maintien', ordre: 0 });
      await Data.saveMember({ ...base, nom: 'Julie', sexe: 'F', naissance: '1992-03-02', poids_kg: 62, taille_cm: 165, activite: 'leger', objectif: 'maintien', ordre: 1 });
      await Data.saveMember({ ...base, nom: 'Léa', sexe: 'F', naissance: '2016-09-15', poids_kg: 28, taille_cm: 128, activite: 'modere', objectif: 'maintien', ordre: 2 });
      out.members = true;
    }
    if (!state.recipes.length) { await seedRecipes(); out.recipes = true; }
    const m = state.members[0];
    if (!companionOf(m)) { await Data.saveCompagnon({ member_id: m.id, espece: 'renard', nom: 'Rouxy' }); out.compagnon = true; }
    state.suiviMember = m.id; store.set('suiviMember', m.id);
    render();
    return out;
  });
}

// Remise à zéro des données de la semaine figée et des compteurs du compagnon (les recettes et membres restent).
async function resetWeek(page) {
  await page.evaluate(async (FIXED_DATE) => {
    const f = foyer();
    const wk = isoDate(mondayOf(isoToDate(FIXED_DATE)));
    const from = isoDate(addDays(isoToDate(wk), -8));
    const to = isoDate(addDays(isoToDate(wk), 6));
    const del = async (t, q) => { const { error } = await q(db.from(t).delete().eq('foyer_id', f)); if (error) throw error; };
    await del('journal', (q) => q.gte('date', from).lte('date', to));
    await del('hydratation', (q) => q.gte('date', from).lte('date', to));
    await del('activites', (q) => q.gte('date', from).lte('date', to));
    await del('bilans', (q) => q.gte('date', from).lte('date', to));
    await del('gains', (q) => q.gte('date', from).lte('date', to));
    await del('courses_ajouts', (q) => q.eq('week', wk));
    await del('courses_coches', (q) => q.eq('week', wk));
    await del('restes', (q) => q);
    await del('placards', (q) => q.eq('type', 'stock'));
    await del('aliments_favoris', (q) => q);
    await del('produits_perso', (q) => q);
    await del('historique_scans', (q) => q);
    // Planning de la semaine figée : uniquement le dîner du mercredi (salade de quinoa).
    await del('planning_repas', (q) => q.eq('week', wk));
    const salad = state.recipes.find((r) => /quinoa/i.test(r.title)) || state.recipes[0];
    const row = { ...own(), week: wk, day: 2, slot: 'soir', recipe_id: salad.id, servings: 3, eaters: null, guests: 0, reste_id: null };
    const { error } = await db.from('planning_repas').upsert(row, { onConflict: 'foyer_id,week,day,slot' });
    if (error) throw error;
    for (const m of state.members) {
      const c = companionOf(m);
      if (c) await Data.saveCompagnon({ ...c, coquillages: 100, serie: 0, meilleure_serie: 0, accessoires: [], fond: 'jardin', friandises: 0, messages: true });
    }
    for (const k of Object.keys(localStorage)) if (/^(bilanShown:|caresses:|queue$|op:|alt:|hiddenAlts|camExplained)/.test(k)) localStorage.removeItem(k);
    state.week = mondayOf(isoToDate(FIXED_DATE));
    state.day = isoToDate(FIXED_DATE);
    state.suiviMember = state.members[0].id;
    await Data.loadAll();
    await Data.loadWeek();
    Pet.queue = [];
    render();
  }, FIXED_DATE);
  await page.waitForTimeout(300);
}

const toastText = (page) => page.$eval('#toast', (e) => e.textContent.trim()).catch(() => '');
const openTab = async (page, tab) => { await page.evaluate((t) => { while (sheets.length) closeSheet(); switchTab(t); }, tab); await page.waitForTimeout(400); };
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

module.exports = { ROOT, FIXTURES, FIXED_DATE, FIXED_TIME, loadEnv, fixture, setupRoutes, installBridge, waitLoaded, closeSheets, login, ensureSeed, resetWeek, toastText, openTab, noHorizontalScroll };
