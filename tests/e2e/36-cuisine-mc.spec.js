// Cuisine reliée à Monsieur Cuisine : semaine des repas, recette et « J'ai mangé ça », liste de courses au magasin
// (rayons, fusion, matériel, placard, coches partagées, modifications qui survivent à la synchro), ajout rapide,
// hors ligne, réglage du batch cooking, mise en page à 360 px.
// Les tables Monsieur Cuisine et courses_modifs sont simulées (faux PostgREST) : le foyer de test n'a pas de compte
// Monsieur Cuisine. Les ajouts à la main et le journal utilisent les vraies tables.
const assert = require('node:assert/strict');
const H = require('../helpers');
const { installPgMock } = require('./pg-mock');

let mock = null;
const TABLES = ['mc_connexions', 'mc_planning', 'mc_courses', 'mc_recettes', 'courses_modifs'];
const segments = (page) => page.$$eval('.segbar button', (l) => l.map((b) => b.dataset.tab));
const texte = (page, sel = '#main') => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' '));
const article = (page, nom) => page.$eval(`xpath=//div[contains(@class,"cmc-art")][.//span[contains(@class,"cmc-art-nom")][starts-with(normalize-space(.), "${nom}")]]`, (e) => ({
  texte: e.textContent.replace(/\s+/g, ' ').trim(), fait: e.classList.contains('cmc-fait'), cle: e.querySelector('[data-cle]').dataset.cle,
}));
const cocher = (page, cle) => page.click(`.cmc-cocher[data-cle="${cle}"]`);

function donnees(f) {
  const maj = '2026-10-21T11:17:00.000Z';
  const c = (mc_id, nom, quantite, unite, recette, rayon = null) => ({ foyer_id: f, mc_id, nom, quantite, unite, rayon, rayon_ordre: null, coche: false, recette, updated_at: maj });
  return {
    mc_connexions: [{ foyer_id: f, user_id: null, statut: 'ok', compte: 'famille@exemple.fr', derniere_synchro: '2026-10-21T11:50:00', erreur: null, stats: { planning: 3, courses: 11, recettes: 3 }, updated_at: maj }],
    mc_planning: [
      { foyer_id: f, mc_id: 'p1', date: '2026-10-21', recette_mc_id: 102, titre: 'Quiche aux poireaux', portions: null, duree_min: 50, image: null, data: { order: 0, recipe: { url: 'https://www.monsieur-cuisine.com/fr/recipe/quiche' } } },
      { foyer_id: f, mc_id: 'p2', date: '2026-10-21', recette_mc_id: 101, titre: 'Gratin de chou-fleur', portions: null, duree_min: 45, image: null, data: { order: 1 } },
      { foyer_id: f, mc_id: 'p3', date: '2026-10-22', recette_mc_id: 103, titre: 'Soupe de carottes', portions: null, duree_min: 30, image: null, data: { order: 0 } },
      { foyer_id: f, mc_id: 'p9', date: '2026-11-02', recette_mc_id: 103, titre: 'Soupe de carottes', portions: null, duree_min: 30, image: null, data: {} },
    ],
    mc_recettes: [
      { foyer_id: f, mc_id: 101, titre: 'Gratin de chou-fleur', perso: false, favori: false, portions: 4, unite_portion: 'portions', duree_min: 45, preparation_min: 15, image: null, updated_at: maj,
        ingredients: [{ nom: 'chou-fleur', quantite: '800', unite: 'g', groupe: '' }, { nom: 'lardons', quantite: '200', unite: 'g', groupe: '' }, { nom: 'comté', quantite: '100', unite: 'g', groupe: 'Pour gratiner' },
          { nom: 'crème fraîche', quantite: '10', unite: 'cl', groupe: '' }, { nom: 'plat à gratin  (20 x 35 cm)', quantite: '1', unite: '', groupe: '' }],
        etapes: [{ titre: 'Cuire le chou-fleur 20 minutes à la vapeur.', texte: 'Cuire le chou-fleur 20 minutes à la vapeur.' }, { titre: 'Mode', texte: null }, { titre: 'Gratiner 25 minutes à 200 °C.', texte: 'Gratiner 25 minutes à 200 °C.' }],
        nutriments: [{ name: 'Calories', amount: 410 }] },
      { foyer_id: f, mc_id: 102, titre: 'Quiche aux poireaux', perso: false, favori: false, portions: 4, unite_portion: 'parts', duree_min: 50, preparation_min: 20, image: null, updated_at: maj,
        ingredients: [{ nom: '', quantite: '500', unite: 'g', groupe: '' }], etapes: [{ titre: 'Émincer les poireaux.', texte: 'Émincer les poireaux.' }], nutriments: null },
      { foyer_id: f, mc_id: 103, titre: 'Soupe de carottes', perso: false, favori: false, portions: 4, unite_portion: 'bols', duree_min: 30, preparation_min: 10, image: null, updated_at: maj,
        ingredients: [], etapes: [], nutriments: [{ name: 'Calories', amount: 180 }, { name: 'Protein', amount: 4 }] },
    ],
    mc_courses: [
      c('r:1', 'Poireaux', '500', 'g', 'Quiche aux poireaux', 'Bœuf'),
      c('r:2', 'Crème fraîche', '20', 'cl', 'Quiche aux poireaux'),
      c('r:3', 'Œufs (calibre M)', '3', null, 'Quiche aux poireaux', 'Produits laitiers'),
      c('r:4', 'Pâte brisée', '1', null, 'Quiche aux poireaux'),
      c('r:5', 'Gousses d\'ail', '2', null, 'Quiche aux poireaux'),
      c('r:6', 'chou-fleur', '800', 'g', 'Gratin de chou-fleur', 'Légumes'),
      c('r:7', 'ail', '1', 'gousse', 'Gratin de chou-fleur'),
      c('r:8', 'crème fraîche', '10', 'cl', 'Gratin de chou-fleur'),
      c('r:9', 'plat à gratin  (20 x 35 cm)', '1', null, 'Gratin de chou-fleur'),
      c('r:10', 'Sel', '1', 'c.c.', 'Gratin de chou-fleur'),
      c('r:11', 'Lardons', '200', 'g', 'Gratin de chou-fleur', 'Porc'),
    ],
    courses_modifs: [],
  };
}

module.exports = {
  name: 'Cuisine reliée à Monsieur Cuisine',
  async before({ page }) {
    const f = await page.evaluate(() => foyer());
    mock = await installPgMock(page, { tables: TABLES, keys: { courses_modifs: ['foyer_id', 'cle'], mc_planning: ['foyer_id', 'mc_id'], mc_courses: ['foyer_id', 'mc_id'], mc_recettes: ['foyer_id', 'mc_id'], mc_connexions: ['foyer_id'] }, seed: donnees(f) });
    await page.route((url) => url.pathname.endsWith('/functions/v1/monsieur-cuisine'), (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
      mock.mc_connexions[0].derniere_synchro = new Date().toISOString();
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, stats: { planning: 4, courses: mock.mc_courses.length, recettes: 3 } }) });
    });
    await page.evaluate(async () => {
      localStorage.removeItem('queue');
      state.plan = []; // liste déterministe : seulement Monsieur Cuisine et les ajouts
      await db.from('courses_ajouts').delete().eq('foyer_id', foyer()).ilike('name', 'Essai cmc%');
      await CQ.load();
      await Modules.get('cuisine-mc').charger(true, {});
    });
  },
  async after({ page }) {
    await page.evaluate(async () => {
      Modules.masquer('batch', false);
      await db.from('courses_ajouts').delete().eq('foyer_id', foyer()).ilike('name', 'Essai cmc%');
      await db.from('journal').delete().eq('foyer_id', foyer()).like('ref', 'mc:%');
      localStorage.removeItem('queue');
    });
  },
  tests: [
    { name: 'Repas : la semaine vient de Monsieur Cuisine, Miam reste accessible', fn: async ({ page }) => {
      await H.openTab(page, 'cuisine');
      assert.equal(await page.evaluate(() => state.tab), 'planning');
      // Batch cooking masqué par défaut : le foyer suit Monsieur Cuisine et n'a ni repas Miam à préparer ni restes.
      assert.deepEqual(await segments(page), ['planning', 'courses', 'recettes', 'scan']);
      assert.equal(await page.$$eval('.cmc-repas', (l) => l.length), 3, 'les 3 repas de la semaine du 19 octobre');
      const jour = await texte(page, '.cmc-jour.cmc-auj');
      assert.match(jour, /Mercredi .*Aujourd'hui.*Quiche aux poireaux.*Gratin de chou-fleur/);
      assert.match(jour, /\d+ kcal\/portion/);
      assert.match(await texte(page, '.cmc-liaison'), /Synchronisé il y a 15 min/);
      await page.click('[data-act="cmc-source"][data-v="miam"]');
      assert.ok(await page.$('.day'), 'planning Miam affiché');
      assert.ok(!(await page.$('.cmc-repas')));
      await page.click('[data-act="cmc-source"][data-v="mc"]');
      assert.ok(await page.$('.cmc-repas'));
    } },
    { name: 'recette : portions, calories de chacun, ingrédients, étapes, « J\'ai mangé ça » vers le journal', fn: async ({ page }) => {
      await page.click('.cmc-repas[data-id="p2"]');
      await page.waitForSelector('.sheet-wrap.open [data-cmc-recette] .cmc-ings');
      const s = () => texte(page, '.sheet-wrap.open [data-cmc-recette]');
      assert.match(await s(), /800 g ?chou-fleur/i);
      assert.match(await s(), /Pour gratiner/i);
      assert.match(await s(), /calculé avec la table Ciqual/);
      assert.equal(await page.$$eval('.sheet-wrap.open .cmc-etapes li', (l) => l.length), 2, 'étape vide « Mode » retirée');
      assert.equal(await page.$$eval('.sheet-wrap.open .cmc-membre', (l) => l.length), await page.evaluate(() => state.members.length));
      assert.match(await texte(page, '.sheet-wrap.open .cmc-membre'), /\d+ kcal/);
      await page.click('.sheet-wrap.open [data-x="plus"]');
      assert.match(await s(), /5 portions/);
      assert.match(await s(), /1000 g ?chou-fleur/i);
      await page.click('.sheet-wrap.open .cmc-membre [data-x="mange"]');
      await page.waitForSelector('.sheet-wrap.open [data-form="qty"]');
      await page.click('.sheet-wrap.open [data-form="qty"] button.primary');
      await page.waitForTimeout(1200);
      assert.match(await H.toastText(page), /Ajouté : \d+ kcal/);
      const j = await page.evaluate(() => state.journal.filter((x) => x.ref === 'mc:101').map((x) => ({ label: x.label, kcal: x.n.kcal, portions: x.portions })));
      assert.equal(j.length, 1);
      assert.equal(j[0].label, 'Gratin de chou-fleur');
      assert.ok(j[0].kcal > 100, String(j[0].kcal));
      await H.closeSheets(page);
    } },
    { name: 'recette sans noms d\'ingrédients : reprise de la liste de courses ; sinon valeurs Monsieur Cuisine', fn: async ({ page }) => {
      await page.click('.cmc-repas[data-id="p1"]');
      await page.waitForSelector('.sheet-wrap.open [data-cmc-recette]');
      let s = await texte(page, '.sheet-wrap.open [data-cmc-recette]');
      assert.match(s, /500 g ?Poireaux/);
      assert.match(s, /repris de la liste de courses/);
      assert.match(s, /Ouvrir dans Monsieur Cuisine/);
      await H.closeSheets(page);
      await page.click('.cmc-repas[data-id="p3"]');
      await page.waitForSelector('.sheet-wrap.open [data-cmc-recette]');
      s = await texte(page, '.sheet-wrap.open [data-cmc-recette]');
      assert.match(s, /180 kcal par portion standard .*valeur donnée par Monsieur Cuisine/);
      assert.match(s, /n'a pas transmis les ingrédients/);
      await H.closeSheets(page);
    } },
    { name: 'Accueil : le prochain repas Monsieur Cuisine dans le fil du jour', fn: async ({ page }) => {
      const els = await page.evaluate(async () => (await Accueil.elements({ date: new Date() })).filter((e) => e.module === 'cuisine-mc').map((e) => ({ titre: e.titre, heure: e.heure, act: e.act })));
      assert.deepEqual(els, [{ titre: 'Au menu : Quiche aux poireaux', heure: '12:30', act: 'cmc-recette' }]);
      const ag = await page.evaluate(async () => (await Agenda.elements(isoToDate('2026-10-19'), isoToDate('2026-10-25'))).filter((e) => e.source === 'cuisine-mc').length);
      assert.equal(ag, 3);
    } },
    { name: 'Courses : rayons dans l\'ordre du magasin, doublons fusionnés, matériel retiré, placard à part', fn: async ({ page }) => {
      await page.click('.segbar [data-tab="courses"]');
      await page.waitForSelector('.cmc-rayon');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Liste de courses');
      const rayons = await page.$$eval('.cmc-rayon > .cmc-rayon-titre .grow', (l) => l.map((e) => e.textContent));
      assert.deepEqual(rayons, ['Fruits & légumes', 'Boucherie', 'Crèmerie & œufs', 'Épicerie salée']);
      assert.match(await texte(page, '.cmc-courant'), /Fruits & légumes/);
      assert.match((await article(page, 'Ail')).texte, /3 gousses/);
      assert.match((await article(page, 'Crème fraîche')).texte, /300 ml/);
      assert.match((await article(page, 'Poireaux')).texte, /500 g.*Quiche aux poireaux/);
      const t = await texte(page);
      assert.match(t, /Matériel retiré de la liste : plat à gratin/);
      assert.match(t, /Déjà au placard \(1\)/);
      assert.doesNotMatch(await texte(page, '.cmc-rayon'), /Sel/);
      assert.ok(await page.$('.cmc-magasin a[href*="coursesu.com"]'), 'lien Courses U conservé');
    } },
    { name: 'cocher : écrit dans courses_modifs ; un rayon terminé passe à la fin', fn: async ({ page }) => {
      for (const cle of ['ail', 'chou fleur', 'poireaux'.replace(/x$/, '')]) { await cocher(page, cle); await page.waitForTimeout(350); }
      const ail = mock.courses_modifs.find((x) => x.cle === 'ail');
      assert.equal(ail?.coche, true);
      assert.ok(ail.coche_le && ail.coche_par && ail.foyer_id, 'coche datée, signée, du foyer');
      assert.match(await texte(page, '.cmc-courant'), /Boucherie/);
      assert.match(await texte(page, ".cmc-magasin"), /3\/7/);
      assert.match(await texte(page, '.cmc-plie summary'), /Rayons terminés \(1\)/);
      await page.click('xpath=//summary[contains(., "Rayons terminés")]');
      await cocher(page, 'ail');
      await page.waitForTimeout(400);
      assert.equal(mock.courses_modifs.find((x) => x.cle === 'ail').coche, false);
      assert.match(await texte(page, '.cmc-courant'), /Fruits & légumes/);
    } },
    { name: 'modifier un article : nom, quantité, précision, rayon ; la modification survit à la synchro', fn: async ({ page }) => {
      await page.click('.cmc-art-menu[data-cle="creme fraiche"]');
      await page.waitForSelector('.sheet-wrap.open [data-form="cmc-modif"]');
      await page.fill('.sheet-wrap.open [name="nom"]', 'Crème fraîche épaisse');
      await page.fill('.sheet-wrap.open [name="quantite"]', '40');
      await page.selectOption('.sheet-wrap.open [name="unite"]', 'cl');
      await page.fill('.sheet-wrap.open [name="precision"]', 'bio, 30 % MG');
      await page.selectOption('.sheet-wrap.open [name="rayon"]', 'Fromages');
      await page.click('.sheet-wrap.open [data-form="cmc-modif"] button.primary');
      await page.waitForTimeout(600);
      const row = mock.courses_modifs.find((x) => x.cle === 'creme fraiche');
      assert.deepEqual({ nom: row.nom, quantite: row.quantite, unite: row.unite, precision: row.precision, rayon: row.rayon }, { nom: 'Crème fraîche épaisse', quantite: '40', unite: 'cl', precision: 'bio, 30 % MG', rayon: 'Fromages' });
      let a = await article(page, 'Crème fraîche épaisse');
      assert.match(a.texte, /40 cl.*modifié.*bio, 30 % MG/);
      // Nouvelle synchro Monsieur Cuisine : la liste est réécrite (quantités changées), la surcharge reste.
      mock.mc_courses.find((x) => x.mc_id === 'r:2').quantite = '25';
      await page.click('.cmc-liaison [data-act="cmc-synchro"]');
      await page.waitForTimeout(1500);
      assert.match(await H.toastText(page), /Synchronisé : 4 repas/);
      assert.match(await texte(page, '.cmc-liaison'), /à l'instant/);
      a = await article(page, 'Crème fraîche épaisse');
      assert.match(a.texte, /40 cl/);
      const rayons = await page.$$eval('.cmc-rayon > .cmc-rayon-titre .grow', (l) => l.map((e) => e.textContent));
      assert.ok(rayons.indexOf('Fromages') > rayons.indexOf('Crèmerie & œufs'), rayons.join(', '));
      // Retour à l'article d'origine : quantité de Monsieur Cuisine (25 + 10 cl).
      await page.click('.cmc-art-menu[data-cle="creme fraiche"]');
      await page.click('.sheet-wrap.open [data-x="origine"]');
      await page.waitForTimeout(600);
      assert.match((await article(page, 'Crème fraîche')).texte, /350 ml/);
    } },
    { name: 'masquer un article, puis le réafficher ; racheter un basique du placard', fn: async ({ page }) => {
      await page.click('.cmc-art-menu[data-cle="pate brisee"]');
      await page.click('.sheet-wrap.open [data-x="masquer"]');
      await page.waitForTimeout(600);
      assert.match(await texte(page), /Articles masqués \(1\)/);
      await page.click('xpath=//summary[contains(., "Articles masqués")]');
      await page.click('[data-act="cmc-reafficher"][data-cle="pate brisee"]');
      await page.waitForTimeout(500);
      assert.doesNotMatch(await texte(page), /Articles masqués/);
      await page.click('xpath=//summary[contains(., "Déjà au placard")]');
      await page.click('[data-act="cmc-forcer"][data-cle="sel"]');
      await page.waitForTimeout(500);
      assert.match((await article(page, 'Sel')).texte, /1 c\. à c\./);
      assert.doesNotMatch(await texte(page), /Déjà au placard/);
    } },
    { name: 'ajout à la main et bouton « + » : dans le bon rayon, semaine en cours', fn: async ({ page }) => {
      await page.fill('[data-form="cmc-ajout"] [name="xname"]', 'Essai cmc lessive');
      await page.fill('[data-form="cmc-ajout"] [name="xqty"]', '1');
      await page.click('[data-form="cmc-ajout"] .cmc-ajout-ok');
      await page.waitForTimeout(1200);
      assert.match(await H.toastText(page), /Ajouté au rayon Entretien & maison/);
      assert.match((await article(page, 'Essai cmc lessive')).texte, /Ajouté à la main/);
      await page.click('.topbar [data-act="ajout-rapide"]');
      await page.fill('.sheet-wrap.open [name="txt"]', 'acheter 2 essai cmc citrons');
      await page.waitForSelector('.sheet-wrap.open .ajout-prop');
      assert.match(await texte(page, '.sheet-wrap.open .ajout-prop'), /Article · 2 Essai cmc citrons/);
      await page.click('.sheet-wrap.open .ajout-prop');
      await page.waitForTimeout(1500);
      assert.match(await H.toastText(page), /Ajouté aux courses/);
      assert.match((await article(page, 'Essai cmc citrons')).texte, /2/);
      const { data } = await page.evaluate(async () => db.from('courses_ajouts').select('name,qty,week').eq('foyer_id', foyer()).ilike('name', 'Essai cmc%'));
      assert.equal(data.length, 2);
      assert.ok(data.every((x) => x.week === '2026-10-19'), 'semaine en cours');
    } },
    { name: 'coche reçue en direct d\'un autre téléphone', fn: async ({ page }) => {
      assert.equal((await article(page, 'Lardons')).fait, false);
      await page.evaluate(() => Modules.get('cuisine-mc').expose.recevoir('modifs', { eventType: 'UPDATE', new: { id: 'autre-tel', cle: 'lardon', coche: true, coche_le: new Date().toISOString() }, old: {} }));
      await page.waitForTimeout(300);
      assert.equal((await article(page, 'Lardons')).fait, true);
    } },
    { name: 'hors ligne : la coche part dans la file d\'attente et se synchronise au retour', fn: async ({ page, ctx }) => {
      await ctx.setOffline(true);
      await cocher(page, 'oeuf');
      await page.waitForTimeout(800);
      assert.equal((await article(page, 'Œufs')).fait, true);
      const enAttente = await page.evaluate(() => Queue.list().filter((o) => o.table === 'courses_modifs').length);
      await ctx.setOffline(false);
      if (enAttente) await page.evaluate(() => Queue.flush());
      await page.waitForTimeout(800);
      assert.equal(mock.courses_modifs.find((x) => x.cle === 'oeuf')?.coche, true, `coche enregistrée (file : ${enAttente})`);
      assert.equal(await page.evaluate(() => Queue.size()), 0);
    } },
    { name: 'terminer les courses : coches remises à zéro, ajouts cochés supprimés', fn: async ({ page }) => {
      await cocher(page, 'essai cmc lessive');
      await page.waitForTimeout(600);
      await page.click('[data-act="cmc-terminer"]');
      await page.click('.sheet-wrap.open [data-x="yes"]');
      await page.waitForTimeout(1500);
      assert.match(await H.toastText(page), /Courses terminées/);
      assert.ok(mock.courses_modifs.every((x) => !x.coche), 'plus aucune coche');
      assert.match(await texte(page, '.cmc-magasin'), /0\/\d+/);
      const { data } = await page.evaluate(async () => db.from('courses_ajouts').select('name').eq('foyer_id', foyer()).ilike('name', 'Essai cmc%'));
      assert.deepEqual(data.map((x) => x.name), ['Essai cmc citrons']);
    } },
    { name: 'réglage « Afficher le batch cooking »', fn: async ({ page }) => {
      await H.openTab(page, 'planning');
      assert.equal(await page.isChecked('[data-cmc-batch]'), false);
      await page.check('[data-cmc-batch]');
      await page.waitForTimeout(300);
      assert.deepEqual(await segments(page), ['planning', 'courses', 'recettes', 'batch', 'scan']);
      assert.equal(await page.evaluate(() => Modules.masques().includes('batch')), false);
      await page.uncheck('[data-cmc-batch]');
      await page.waitForTimeout(300);
      assert.ok(!(await segments(page)).includes('batch'));
    } },
    { name: 'mise en page à 360 px : ni débordement, ni texte coupé', fn: async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      for (const tab of ['planning', 'courses', 'cuisine-mc']) {
        await H.openTab(page, tab);
        assert.ok(await H.noHorizontalScroll(page), `pas de défilement horizontal (${tab})`);
      }
      await H.openTab(page, 'courses');
      const trop = await page.$$eval('.cmc-art, .cmc-magasin, .cmc-liaison, .cmc-ajout', (l) => l.filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length);
      assert.equal(trop, 0);
      await page.setViewportSize({ width: 390, height: 844 });
    } },
  ],
};
