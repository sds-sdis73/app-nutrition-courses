const assert = require('node:assert/strict');
const H = require('../helpers');

const shells = (page) => page.evaluate(() => companionOf(journalMember()).coquillages);
const active = (page) => page.evaluate(() => expense(journalMember(), new Date()).active);

module.exports = {
  name: 'Eau et activités',
  tests: [
    { name: '+250 ml depuis l\'accueil : anneau et repère « Midi » (12 h 05) mis à jour', fn: async ({ page }) => {
      await page.click('.quick3 [data-act="eau-add"]');
      await page.waitForTimeout(1200);
      assert.equal(await page.evaluate(() => waterTotal(journalMember(), new Date())), 250);
      assert.match(await page.$eval('.ring:nth-child(3) b', (e) => e.textContent), /^250 ml \//);
      const eau = await page.$$eval('.timeline .tl-item.eau', (l) => l.map((e) => e.innerText));
      assert.match(eau[0], /0 ml \/ 500 ml/, 'la matinée est passée sans boisson');
      assert.match(eau[1], /1 boisson · 250 ml[\s\S]*250 ml \/ 1 L|250 ml \/ 1 L[\s\S]*1 boisson · 250 ml/);
    } },
    { name: 'feuille Hydratation : bouteille, quantité libre, suppression', fn: async ({ page }) => {
      await page.evaluate(() => eauSheet());
      await page.waitForSelector('[data-ml="500"]');
      await page.click('[data-ml="500"]');
      await page.waitForTimeout(800);
      await page.fill('form[data-form="eau"] [name="ml"]', '150');
      await page.click('form[data-form="eau"] button.primary');
      await page.waitForTimeout(800);
      assert.equal(await page.$$eval('.sheet-wrap.open [data-del]', (l) => l.length), 3);
      assert.equal(await page.evaluate(() => waterTotal(journalMember(), new Date())), 900);
      await page.click('.sheet-wrap.open [data-del]');
      await page.waitForTimeout(800);
      assert.equal(await page.$$eval('.sheet-wrap.open [data-del]', (l) => l.length), 2);
      await H.closeSheets(page);
    } },
    { name: 'objectif d\'eau atteint : critère validé et +5 coquillages (la 3e boisson, déjà comptée, ne redonne rien)', fn: async ({ page }) => {
      const before = await shells(page);
      await page.evaluate(() => addWater(2000));
      await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(() => dayCriteria(journalMember(), new Date()).items.find((i) => i.key === 'eau').ok), true);
      assert.equal(await shells(page), before + 5, 'objectif (+5) ; clé « eau:3 » déjà gagnée avant la suppression');
    } },
    { name: 'CrossFit 45 min à 11 h : « faite », 480 kcal pour 80 kg', fn: async ({ page }) => {
      await page.click('.quick3 [data-act="activite-add"]');
      await page.waitForSelector('form[data-form="activite"]');
      assert.ok((await page.$$eval('form[data-form="activite"] optgroup', (l) => l.map((o) => o.label))).includes('Cardio & fitness'));
      const idx = await page.$eval('select[name="type"]', (s) => [...s.options].find((o) => o.text === 'CrossFit').value);
      await page.selectOption('select[name="type"]', idx);
      await page.fill('[name="minutes"]', '45');
      await page.fill('[name="heure"]', '11:00');
      await page.dispatchEvent('[name="heure"]', 'input');
      assert.equal(await page.$eval('[name="kcal"]', (i) => i.value), '480');
      assert.equal(await page.$eval('[data-st][aria-pressed="true"]', (b) => b.dataset.st), 'fait');
      await page.click('form[data-form="activite"] button.primary');
      await page.waitForTimeout(1500);
      assert.equal(await active(page), 480);
      assert.match(await page.$eval('.timeline .tl-item.sport.done', (e) => e.innerText), /CrossFit/);
      assert.match(await page.$eval('.ring:nth-child(2) b', (e) => e.textContent), /^480 \//);
    } },
    { name: 'activité à 18 h : « prévue » automatiquement, puis « C\'est fait »', fn: async ({ page }) => {
      await page.evaluate(() => activiteSheet());
      await page.waitForSelector('form[data-form="activite"]');
      await page.fill('[name="heure"]', '18:00');
      await page.dispatchEvent('[name="heure"]', 'input');
      assert.equal(await page.$eval('[data-st][aria-pressed="true"]', (b) => b.dataset.st), 'prevu');
      await page.click('form[data-form="activite"] button.primary');
      await page.waitForTimeout(1500);
      assert.equal(await active(page), 480, 'une activité prévue ne compte pas');
      await page.waitForSelector('.timeline .tl-item.sport.next [data-act="activite-done"]');
      await page.click('.timeline .tl-item.sport.next [data-act="activite-done"]');
      await page.waitForTimeout(1500);
      assert.ok((await active(page)) > 480);
      assert.equal(await page.$('.timeline .tl-item.sport.next'), null);
    } },
    { name: 'calories saisies à la main conservées quand on change l\'heure, recalculées quand on change la durée', fn: async ({ page }) => {
      await page.evaluate(() => activiteSheet());
      await page.waitForSelector('form[data-form="activite"]');
      await page.fill('[name="kcal"]', '999');
      await page.fill('[name="heure"]', '09:00');
      await page.dispatchEvent('[name="heure"]', 'input');
      assert.equal(await page.$eval('[name="kcal"]', (i) => i.value), '999');
      await page.fill('[name="minutes"]', '60');
      await page.dispatchEvent('[name="minutes"]', 'input');
      assert.notEqual(await page.$eval('[name="kcal"]', (i) => i.value), '999');
      await H.closeSheets(page);
    } },
  ],
};
