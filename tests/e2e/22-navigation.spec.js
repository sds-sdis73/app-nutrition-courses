// Navigation à 5 onglets, segments, menu « Plus », écrans « Bientôt ici », batch masquable,
// bouton « + » d'ajout rapide, et outils du parallèle (faux PostgREST générique + Sync).
const assert = require('node:assert/strict');
const H = require('../helpers');
const { installPgMock } = require('./pg-mock');

const segments = (page) => page.$$eval('.segbar button', (l) => l.map((b) => b.dataset.tab));
const tab = async (page, id) => { await page.click(`.tabbar [data-tab="${id}"]`); await page.waitForTimeout(400); };

module.exports = {
  name: 'Navigation à 5 onglets et registre des modules',
  async after({ page }) {
    await page.evaluate(async () => { Modules.masquer('batch', false); for (const x of state.extras.filter((e) => /^Beurre d'essai/.test(e.name))) await Data.deleteExtra(x.id); });
  },
  tests: [
    { name: 'barre : Accueil · Famille · Cuisine · Forme · Plus, avec leurs libellés', fn: async ({ page }) => {
      assert.deepEqual(await page.$$eval('.tabbar button', (l) => l.map((b) => b.textContent.trim())), ['Accueil', 'Famille', 'Cuisine', 'Forme', 'Plus']);
      assert.equal(await page.$eval('.tabbar [aria-current="page"]', (b) => b.dataset.tab), 'accueil');
      assert.deepEqual(await segments(page), ['aujourdhui', 'accueil-famille', 'suivi']);
    } },
    { name: 'Famille : 5 segments, écrans « Bientôt ici »', fn: async ({ page }) => {
      await tab(page, 'famille');
      assert.deepEqual(await segments(page), ['agenda', 'taches', 'messages', 'photos', 'carnet']);
      assert.equal(await page.evaluate(() => state.tab), 'agenda');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Agenda familial');
      await page.click('.segbar [data-tab="carnet"]');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Carnet de la famille');
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'Cuisine : Repas, Courses, Recettes, Batch, Scan ; l\'onglet rouvre le dernier segment', fn: async ({ page }) => {
      await tab(page, 'cuisine');
      assert.deepEqual(await segments(page), ['planning', 'courses', 'recettes', 'batch', 'scan']);
      await page.click('.segbar [data-tab="recettes"]');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Mes recettes');
      await tab(page, 'famille');
      await tab(page, 'cuisine');
      assert.equal(await page.evaluate(() => state.tab), 'recettes');
      await tab(page, 'accueil');
      assert.equal(await page.evaluate(() => state.tab), 'aujourdhui');
    } },
    { name: 'Plus : menu des réglages et outils, retour, feuille Réglages', fn: async ({ page }) => {
      await tab(page, 'plus');
      assert.deepEqual(await page.$$eval('.plus-ligne', (l) => l.map((b) => b.dataset.id)), ['reglages', 'univers', 'notifications', 'agenda-synchro', 'monsieur-cuisine', 'securite', 'sauvegarde', 'widget']);
      await page.click('.plus-ligne[data-id="sauvegarde"]');
      await page.waitForSelector('[data-act="sauvegarde-exporter"]');
      assert.equal(await page.$eval('.tabbar [aria-current="page"]', (b) => b.dataset.tab), 'plus');
      await page.click('.plus-retour');
      await page.waitForSelector('.plus-ligne');
      await page.click('.plus-ligne[data-id="reglages"]');
      await page.waitForSelector('.sheet-wrap.open [data-form="settings"]');
      await H.closeSheets(page);
    } },
    { name: 'batch cooking masquable depuis Plus', fn: async ({ page }) => {
      await tab(page, 'plus');
      await page.uncheck('[data-afficher="batch"]');
      await H.openTab(page, 'planning');
      assert.deepEqual(await segments(page), ['planning', 'courses', 'recettes', 'scan']);
      await H.openTab(page, 'plus');
      await page.check('[data-afficher="batch"]');
      await H.openTab(page, 'planning');
      assert.ok((await segments(page)).includes('batch'));
    } },
    { name: 'bouton « + » : une phrase libre devient des articles de courses', fn: async ({ page }) => {
      await page.click('.topbar [data-act="ajout-rapide"]');
      await page.waitForSelector('.sheet-wrap.open [data-form="ajout-rapide"]');
      const grises = await page.$$eval('.sheet-wrap.open [data-t]', (l) => l.map((b) => [b.dataset.t, b.disabled]));
      assert.deepEqual(await page.evaluate((g) => g.filter(([t, d]) => d === !!AjoutRapide.pour(t)).map(([t]) => t), grises), [], 'un type est grisé seulement sans analyseur');
      await page.fill('.sheet-wrap.open [name="txt"]', 'acheter du beurre d\'essai et 2 beurre d\'essai bio');
      await page.waitForSelector('.sheet-wrap.open .ajout-prop');
      assert.match(await page.$eval('.sheet-wrap.open .ajout-prop', (b) => b.textContent), /Article/);
      await page.click('.sheet-wrap.open .ajout-prop');
      await page.waitForTimeout(1500);
      assert.match(await H.toastText(page), /2 articles ajoutés/);
      const noms = await page.evaluate(() => state.extras.map((e) => `${e.qty || ''}|${e.name}`));
      assert.ok(noms.includes('|Beurre d\'essai') && noms.includes('2|Beurre d\'essai bio'), noms.join(', '));
    } },
    { name: 'faux PostgREST générique et écriture d\'un module (Sync)', fn: async ({ page }) => {
      const mock = await installPgMock(page, { tables: ['tt_essai'], seed: { tt_essai: [{ id: 'a1', titre: 'Déjà là', ordre: 2 }] } });
      const r = await page.evaluate(async () => {
        if (!Modules.get('essai-e2e')) Modules.register({ id: 'essai-e2e', onglet: 'plus', tables: { tt_essai: 'tt_essai' }, rendu: () => '' });
        const ligne = await Sync.upsert('tt_essai', { titre: 'Nouveau', ordre: 1 });
        const { data } = await db.from('tt_essai').select('*').order('ordre');
        const { data: un } = await db.from('tt_essai').select('*').eq('id', 'a1').single();
        await Sync.supprimer('tt_essai', 'a1');
        return { ligne, titres: data.map((x) => x.titre), un: un.titre };
      });
      assert.deepEqual(r.titres, ['Nouveau', 'Déjà là']);
      assert.equal(r.un, 'Déjà là');
      assert.ok(r.ligne.foyer_id && r.ligne.user_id, 'foyer et compte renseignés');
      assert.deepEqual(mock.tt_essai.map((x) => x.titre), ['Nouveau']);
    } },
  ],
};
