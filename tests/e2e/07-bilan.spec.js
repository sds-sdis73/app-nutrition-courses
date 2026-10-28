const assert = require('node:assert/strict');
const H = require('../helpers');

// Prépare une veille « dans la cible » pour le membre courant.
const seedYesterday = (page, daysAgo = 1) => page.evaluate(async (daysAgo) => {
  const m = journalMember();
  const y = isoDate(addDays(new Date(), -daysAgo));
  const nd = needs(m);
  const k = nd.kcal * 0.97;
  const n = (f) => ({ kcal: k * f, prot: nd.prot * f, gluc: nd.gluc * f, suc: 4, lip: nd.lip * f, ags: 2, fib: nd.fib * f, sel: 1, ca: 100, fe: 2, vitc: 10 });
  for (const slot of ['petit-dejeuner', 'midi', 'soir']) {
    const { error } = await db.from('journal').insert({ ...own(), date: y, member_id: m.id, slot, label: `Repas test ${slot}`, source: 'ciqual', ref: '1', grams: 300, n: n(1 / 3) });
    if (error) throw error;
  }
  const { error } = await db.from('hydratation').insert({ ...own(), member_id: m.id, date: y, heure: '12:00', ml: 2000 });
  if (error) throw error;
  await Data.loadWeek();
  return y;
}, daysAgo);

module.exports = {
  name: 'Bilan du soir (21 h 50)',
  clock: `${H.FIXED_DATE}T21:50:00`,
  tests: [
    { name: 'dîner passé depuis moins de 2 h 30 : « À noter quand tu veux » ; déjeuner et goûter : « Rien de noté »', fn: async ({ page }) => {
      const cards = await page.$$eval('.timeline .tl-item.repas', (l) => l.map((x) => x.innerText));
      assert.match(cards[1], /Rien de noté/);
      assert.match(cards[2], /Rien de noté/);
      assert.match(cards[3], /Dîner/);
      assert.doesNotMatch(cards[3], /Rien de noté/);
    } },
    { name: 'la veille est évaluée : bilan enregistré, coquillages et série, feuille affichée une seule fois', fn: async ({ page }) => {
      const y = await seedYesterday(page);
      const before = await page.evaluate(() => companionOf(journalMember()).coquillages);
      await page.evaluate(() => evaluateYesterday());
      await page.waitForTimeout(2000);
      const b = await page.evaluate((y) => state.bilans.find((x) => x.date === y && x.member_id === journalMember().id), y);
      assert.ok(b, 'bilan créé');
      assert.equal(b.criteres.cible, true);
      assert.ok(b.score >= 5);
      const c = await page.evaluate(() => ({ ...companionOf(journalMember()) }));
      assert.equal(c.coquillages, before + b.coquillages);
      assert.equal(c.serie, 1);
      assert.equal(c.meilleure_serie, 1);
      assert.ok(await page.$('.sheet-wrap.open .confetti'), 'confettis : objectif atteint sans excès');
      assert.match(await page.$eval('.sheet-wrap.open', (e) => e.textContent), /Bilan de/);
      assert.equal(await page.evaluate((y) => store.get(`bilanShown:${y}`, false), y), true);
      await H.closeSheets(page);
      await page.evaluate(() => evaluateYesterday());
      await page.waitForTimeout(1000);
      assert.equal(await page.evaluate(() => sheets.length), 0, 'pas de seconde feuille');
      assert.equal(await page.evaluate(() => companionOf(journalMember()).coquillages), c.coquillages, 'pas de double gain');
    } },
    { name: 'Suivi › Semaine : étoile sur le jour dans la cible et « Petites victoires »', fn: async ({ page }) => {
      await H.openTab(page, 'suivi');
      await page.click('[data-act="suivi-view"][data-v="semaine"]');
      await page.waitForTimeout(500);
      assert.ok((await page.$$eval('.week-chart .wc-val', (l) => l.map((x) => x.textContent))).includes('⭐'));
      assert.match(await page.$eval('.victoires', (e) => e.textContent), /1 \/ 1/);
    } },
  ],
};
