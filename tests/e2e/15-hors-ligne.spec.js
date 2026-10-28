const assert = require('node:assert/strict');
const H = require('../helpers');

const addApple = (page) => page.evaluate(async () => {
  const m = journalMember();
  await Data.addJournal({ date: isoDate(new Date()), member_id: m.id, slot: 'gouter', label: 'Pomme hors ligne', source: 'ciqual', ref: '13039', grams: 150, n: { kcal: 81, prot: 0.4, gluc: 17, suc: 15, lip: 0.2, ags: 0, fib: 2, sel: 0 } });
  render();
});

module.exports = {
  name: 'Hors ligne : file d\'attente et synchronisation',
  checkErrors: false,
  tests: [
    { name: 'hors ligne : bannière, saisie mise en file, visible dans le fil', fn: async ({ page, ctx }) => {
      await ctx.setOffline(true);
      await page.waitForTimeout(500);
      await addApple(page);
      await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => Queue.size()), 1);
      assert.ok(await page.$('.offline-banner'), 'bannière hors ligne');
      assert.match(await page.$eval('.offline-banner', (e) => e.textContent), /1 saisie/);
      assert.match(await page.$eval('.timeline', (e) => e.innerText), /Pomme hors ligne/);
      assert.ok(await page.evaluate(() => state.journal.some((j) => String(j.id).startsWith('local:'))));
    } },
    { name: 'supprimer une saisie locale la retire de la file sans erreur', fn: async ({ page }) => {
      await page.click('.timeline .tl-food [data-act="journal-del"]');
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => Queue.size()), 0);
      assert.doesNotMatch(await page.$eval('.timeline', (e) => e.innerText), /Pomme hors ligne/);
    } },
    { name: 'retour en ligne : la saisie est envoyée et affichée avec un vrai identifiant, sans rechargement', fn: async ({ page, ctx }) => {
      await addApple(page);
      assert.equal(await page.evaluate(() => Queue.size()), 1);
      await ctx.setOffline(false);
      await page.waitForFunction(() => Queue.size() === 0 && state.loaded && !state.offline, null, { timeout: 30000 });
      await page.waitForTimeout(800);
      const j = await page.evaluate(() => state.journal.filter((x) => x.label === 'Pomme hors ligne').map((x) => x.id));
      assert.equal(j.length, 1);
      assert.doesNotMatch(j[0], /^local:/);
      assert.equal(await page.$('.offline-banner'), null);
      assert.match(await page.$eval('.timeline', (e) => e.innerText), /Pomme hors ligne/);
    } },
  ],
};
