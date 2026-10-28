const assert = require('node:assert/strict');
const H = require('../helpers');

module.exports = {
  name: 'Suivi nutritionnel',
  before: async ({ page }) => {
    await page.evaluate(async () => {
      const m = journalMember();
      const d = isoDate(new Date());
      await Data.addJournal({ date: d, member_id: m.id, slot: 'midi', label: 'Riz blanc, cuit', source: 'ciqual', ref: '9104', grams: 200, n: { kcal: 310, prot: 6, gluc: 68, suc: 0, lip: 1, ags: 0, fib: 2, sel: 0, ca: 10, fe: 0.4, vitc: 0 } });
      await Data.addEau({ member_id: m.id, date: d, heure: '09:00', ml: 500 });
      await Data.addActivite({ member_id: m.id, date: d, heure: '08:00', statut: 'fait', source: 'manuel', kind: 'seance', ref: uid(), label: 'Marche rapide', kcal: 150, minutes: 30 });
      render();
    });
  },
  tests: [
    { name: 'vue Jour : calories, macros, activité & hydratation', fn: async ({ page }) => {
      await H.openTab(page, 'suivi');
      const txt = await page.$eval('#main', (e) => e.textContent);
      assert.match(txt, /310/);
      assert.match(txt, /kcal restantes/);
      assert.match(txt, /Activité & hydratation/);
      assert.match(txt, /Marche rapide/);
      assert.match(txt, /500 ml/);
      assert.ok((await page.$$eval('.mbar', (l) => l.length)) >= 4);
      assert.ok(await page.$('[data-act="journal-del"]'), 'entrée supprimable depuis le suivi');
    } },
    { name: 'tout le foyer et retour à un membre', fn: async ({ page }) => {
      await page.click('[data-act="suivi-member"][data-v="foyer"]');
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => state.suiviMember), 'foyer');
      const id = await page.evaluate(() => state.members[0].id);
      await page.click(`[data-act="suivi-member"][data-v="${id}"]`);
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => state.suiviMember), id);
    } },
    { name: 'navigation jour précédent / aujourd\'hui', fn: async ({ page }) => {
      await page.click('[data-act="suivi-day"][data-d="-1"]');
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => isoDate(state.day)), '2026-10-20');
      await page.click('[data-act="suivi-day"][data-d="0"]');
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => isoDate(state.day)), '2026-10-21');
    } },
    { name: 'vue Semaine : 7 colonnes, besoin, dépense, moyenne', fn: async ({ page }) => {
      await page.click('[data-act="suivi-view"][data-v="semaine"]');
      await page.waitForTimeout(500);
      assert.equal(await page.$$eval('.week-chart .wc-col', (l) => l.length), 7);
      const txt = await page.$eval('#main', (e) => e.textContent);
      assert.match(txt, /Moyenne par jour/);
      assert.match(txt, /Dépense moyenne/);
      await page.click('.week-chart .wc-col.today');
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => state.suiviView), 'jour');
    } },
  ],
};
