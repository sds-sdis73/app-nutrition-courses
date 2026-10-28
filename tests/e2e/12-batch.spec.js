const assert = require('node:assert/strict');
const H = require('../helpers');

module.exports = {
  name: 'Batch cooking et restes',
  tests: [
    { name: 'session de batch générée depuis le planning', fn: async ({ page }) => {
      // Un repas « poulet rôti » en plus du dîner : des étapes à l'avance existent.
      await page.evaluate(async () => { const r = state.recipes.find((x) => /poulet/i.test(x.title)); await Data.setMeal(4, 'soir', r.id, 3); render(); });
      await H.openTab(page, 'batch');
      const txt = await page.$eval('#main', (e) => e.textContent);
      assert.match(txt, /Poulet rôti/);
      assert.ok((await page.$$eval('.phase', (l) => l.length)) >= 1, 'au moins une phase');
    } },
    { name: 'déclarer des portions restantes depuis le planning (congélateur)', fn: async ({ page }) => {
      await H.openTab(page, 'planning');
      await page.click('[data-act="slot"][data-d="4"][data-s="soir"]');
      await page.click('.sheet-wrap.open [data-m="reste"]');
      await page.waitForSelector('[data-portions]');
      for (let i = 0; i < 5; i++) await page.click('[data-r="0.5"]');
      assert.match(await page.$eval('[data-portions]', (e) => e.textContent), /^3,5/);
      await page.click('[data-st="congel"]');
      assert.match(await page.$eval('[data-dlc]', (e) => e.textContent), /3 mois/);
      await page.click('[data-x="save"]');
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => ({ ...state.restes[0] }));
      assert.equal(Number(r.portions), 3.5);
      assert.equal(r.stockage, 'congel');
      await H.closeSheets(page);
    } },
    { name: 'le reste est listé dans Batch et proposé pour demain ; rappel « sortir du congélateur » dans le fil', fn: async ({ page }) => {
      await H.openTab(page, 'batch');
      assert.match(await page.$eval('#main', (e) => e.textContent), /congélateur/);
      await H.openTab(page, 'planning');
      await page.click('[data-act="slot"][data-d="3"][data-s="soir"]');
      await page.waitForSelector('[data-reste]');
      await page.click('[data-reste]');
      await page.waitForTimeout(1500);
      assert.ok(await page.evaluate(() => state.plan.some((m) => m.day === 3 && m.slot === 'soir' && m.reste_id)));
      assert.ok((await page.evaluate(() => Number(state.restes[0].portions))) > 0 && (await page.evaluate(() => Number(state.restes[0].portions))) < 3.5, 'portions décomptées');
      await H.openTab(page, 'aujourdhui');
      assert.match(await page.$eval('.timeline', (e) => e.innerText), /Sortir du congélateur/);
    } },
    { name: 'retirer un reste depuis Batch', fn: async ({ page }) => {
      await H.openTab(page, 'batch');
      await page.click('[data-act="reste-del"]');
      await page.waitForTimeout(500);
      if (await page.$('[data-x="yes"]')) { await page.click('[data-x="yes"]'); await page.waitForTimeout(800); }
      assert.equal(await page.evaluate(() => state.restes.length), 0);
    } },
  ],
};
