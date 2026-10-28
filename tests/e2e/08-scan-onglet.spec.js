const assert = require('node:assert/strict');
const H = require('../helpers');

module.exports = {
  name: 'Onglet Scan : fiche produit, journal, historique',
  tests: [
    { name: 'code saisi à la main : fiche avec note, Nutri-Score et additif', fn: async ({ page }) => {
      await H.openTab(page, 'scan');
      await page.fill('[data-form="ean-inline"] [name="ean"]', '3270160891474');
      await page.click('[data-form="ean-inline"] button');
      await page.waitForFunction(() => /Lasagnes/.test(document.querySelector('.sheet-wrap.open')?.textContent || ''), null, { timeout: 10000 });
      const txt = await page.$eval('.sheet-wrap.open', (e) => e.textContent);
      assert.match(txt, /Lasagnes à la bolognaise/);
      assert.match(txt, /\/100/);
      assert.match(txt, /E415|xanthane/i);
      assert.ok(await page.$('.sheet-wrap.open [data-x="journal"]'));
    } },
    { name: '« Ajouter à mon journal » depuis la fiche', fn: async ({ page }) => {
      await page.click('.sheet-wrap.open [data-x="journal"]');
      await page.waitForSelector('form[data-form="qty"]');
      await page.selectOption('form[data-form="qty"] [name="slot"]', 'midi');
      await page.click('form[data-form="qty"] button.primary');
      await page.waitForTimeout(1200);
      assert.ok(await page.evaluate(() => state.journal.some((j) => /Lasagnes/.test(j.label) && j.date === isoDate(new Date()))));
      await H.closeSheets(page);
    } },
    { name: 'historique : produit listé, filtre par note, effacement', fn: async ({ page }) => {
      await page.waitForFunction(() => state.scans.length >= 1);
      await H.openTab(page, 'scan');
      assert.match(await page.$eval('#main', (e) => e.textContent), /Lasagnes à la bolognaise/);
      const chips = await page.$$eval('[data-act="scan-filter"]', (l) => l.map((c) => c.dataset.v));
      assert.ok(chips.includes('tous'));
      const others = chips.filter((c) => c !== 'tous');
      let hidden = false;
      for (const c of others) {
        await page.click(`[data-act="scan-filter"][data-v="${c}"]`);
        await page.waitForTimeout(250);
        if (!/Lasagnes à la bolognaise/.test(await page.$eval('#main', (e) => e.textContent))) { hidden = true; break; }
      }
      assert.ok(hidden, 'au moins un filtre masque le produit');
      await page.click('[data-act="scan-filter"][data-v="tous"]');
      await page.waitForTimeout(250);
      await page.click('[data-act="clear-scans"]');
      await page.waitForSelector('[data-x="yes"]');
      await page.click('[data-x="yes"]');
      await page.waitForTimeout(1000);
      assert.equal(await page.evaluate(() => state.scans.length), 0);
      assert.equal(await page.$('[data-act="clear-scans"]'), null);
    } },
  ],
};
