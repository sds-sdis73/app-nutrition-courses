const assert = require('node:assert/strict');

// Un lundi matin : la veille (dimanche) appartient à la semaine précédente et doit quand même être évaluée.
module.exports = {
  name: 'Bilan du dimanche évalué le lundi',
  clock: '2026-10-19T09:00:00',
  tests: [
    { name: 'journal du dimanche chargé à part, bilan créé, état de la semaine courante intact', fn: async ({ page }) => {
      const y = await page.evaluate(async () => {
        const m = journalMember();
        const y = isoDate(addDays(new Date(), -1));
        const nd = needs(m);
        const n = { kcal: nd.kcal * 0.95, prot: nd.prot, gluc: nd.gluc, suc: 5, lip: nd.lip * 0.9, ags: 3, fib: nd.fib, sel: 1, ca: 100, fe: 2, vitc: 10 };
        const { error } = await db.from('journal').insert({ ...own(), date: y, member_id: m.id, slot: 'midi', label: 'Grand repas du dimanche', source: 'ciqual', ref: '1', grams: 900, n });
        if (error) throw error;
        return y;
      });
      assert.equal(y, '2026-10-18');
      assert.notEqual(await page.evaluate((y) => isoDate(mondayOf(isoToDate(y))), y), await page.evaluate(() => isoDate(state.week)), 'la veille est dans une autre semaine');
      const weekBefore = await page.evaluate(() => isoDate(state.week));
      const planBefore = await page.evaluate(() => state.plan.length);
      await page.evaluate(() => evaluateYesterday());
      await page.waitForTimeout(2500);
      const b = await page.evaluate((y) => state.bilans.find((x) => x.date === y && x.member_id === journalMember().id), y);
      assert.ok(b, 'bilan du dimanche créé');
      assert.equal(b.criteres.cible, true);
      assert.equal(await page.evaluate(() => isoDate(state.week)), weekBefore, 'semaine courante conservée');
      assert.equal(await page.evaluate(() => state.plan.length), planBefore, 'planning courant conservé');
      assert.equal(await page.evaluate(() => state.journal.some((j) => j.label === 'Grand repas du dimanche')), false, 'journal courant non pollué');
    } },
  ],
};
