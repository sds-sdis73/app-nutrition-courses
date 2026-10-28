const assert = require('node:assert/strict');
const H = require('../helpers');

module.exports = {
  name: 'Liste de courses',
  tests: [
    { name: 'liste générée depuis le planning, par rayon, sans les basiques', fn: async ({ page }) => {
      await H.openTab(page, 'courses');
      assert.ok((await page.$$eval('.aisle', (l) => l.length)) >= 1);
      const txt = await page.$eval('#main', (e) => e.textContent);
      assert.match(txt, /quinoa/i);
      assert.match(txt, /Basiques non listés/);
      assert.match(await page.$eval('[data-checked-count]', (e) => e.textContent), /^0\/\d+ articles cochés$/);
    } },
    { name: 'article libre ajouté puis retiré', fn: async ({ page }) => {
      await page.fill('[data-form="extra"] [name="xname"]', 'Lessive');
      await page.fill('[data-form="extra"] [name="xqty"]', '1');
      await page.click('[data-form="extra"] button');
      await page.waitForTimeout(1000);
      assert.match(await page.$eval('#main', (e) => e.textContent), /Lessive/);
      assert.equal(await page.evaluate(() => state.extras.length), 1);
      await page.click('[data-act="del-extra"]');
      await page.waitForTimeout(1000);
      assert.equal(await page.evaluate(() => state.extras.length), 0);
    } },
    { name: 'cocher un article : compteur mis à jour immédiatement', fn: async ({ page }) => {
      await page.click('[data-check]');
      await page.waitForTimeout(800);
      assert.match(await page.$eval('[data-checked-count]', (e) => e.textContent), /^1\/\d+ articles cochés$/);
      assert.equal(await page.$$eval('.shop-item.done', (l) => l.length), 1);
      await page.click('[data-check]');
      await page.waitForTimeout(800);
      assert.match(await page.$eval('[data-checked-count]', (e) => e.textContent), /^0\//);
    } },
    { name: '« j\'en ai » déplace l\'article en stock, « remettre » le ramène', fn: async ({ page }) => {
      const before = await page.$$eval('[data-check]', (l) => l.length);
      await page.click('[data-act="have-item"]');
      await page.waitForTimeout(1200);
      assert.equal(await page.$$eval('[data-check]', (l) => l.length), before - 1);
      assert.match(await page.$eval('#main', (e) => e.textContent), /Déjà en stock cette semaine \(1\)/);
      await page.click('details.ndetails summary');
      await page.click('[data-act="unstock"]');
      await page.waitForTimeout(1200);
      assert.equal(await page.$$eval('[data-check]', (l) => l.length), before);
    } },
    { name: 'basiques du placard : ajout et suppression', fn: async ({ page }) => {
      const n0 = await page.evaluate(() => basiques().length);
      await page.click('[data-act="basiques"]');
      await page.waitForSelector('form[data-form="basique"] [name="name"]');
      await page.fill('form[data-form="basique"] [name="name"]', 'Cumin test');
      await page.click('form[data-form="basique"] button');
      await page.waitForTimeout(1000);
      assert.equal(await page.evaluate(() => basiques().length), n0 + 1);
      const id = await page.evaluate(() => basiques().find((b) => b.name === 'Cumin test').id);
      await page.click(`.sheet-wrap.open [data-del="${id}"]`);
      await page.waitForTimeout(1000);
      assert.equal(await page.evaluate(() => basiques().length), n0);
      await H.closeSheets(page);
    } },
    { name: 'mémoriser un produit Courses U avec un prix : budget estimé', fn: async ({ page }) => {
      await page.click('[data-act="link-item"]');
      await page.waitForSelector('form[data-form="link"] [name="url"]');
      await page.fill('form[data-form="link"] [name="url"]', 'https://www.coursesu.com/p/quinoa-bio-500g-123456');
      await page.fill('form[data-form="link"] [name="prix"]', '2.5');
      await page.click('form[data-form="link"] button.primary');
      await page.waitForTimeout(1500);
      assert.ok(await page.evaluate(() => Object.values(state.links).some((l) => Number(l.prix) === 2.5)));
      assert.match(await page.$eval('#main', (e) => e.textContent), /2,50 €/);
      await page.evaluate(async () => { for (const k of Object.keys(state.links)) await Data.deleteLink(k); render(); });
    } },
    { name: 'copier la liste : texte complet', fn: async ({ page }) => {
      await page.evaluate(() => { window.__copied = ''; navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
      await page.click('[data-act="copy-list"]');
      await page.waitForTimeout(600);
      const t = await page.evaluate(() => window.__copied);
      assert.match(t, /quinoa/i);
    } },
  ],
};
