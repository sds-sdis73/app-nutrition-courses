const assert = require('node:assert/strict');
const H = require('../helpers');

const stubScanner = (page, codes) => page.evaluate((c) => { window.__codes = c; Scanner.open = (cb) => cb(window.__codes.shift()); }, codes);
const sheetTitle = (page) => page.$$eval('.sheet-wrap .sheet-head h2, .sheet-wrap h2', (l) => l.map((x) => x.textContent.trim()).pop());

module.exports = {
  name: 'Scan de code-barres depuis « Noter »',
  tests: [
    { name: 'produit connu (lasagnes) : quantité préremplie avec la portion de l\'emballage, puis ajout', fn: async ({ page }) => {
      await stubScanner(page, ['3270160891474']);
      await page.evaluate(() => journalAdd('midi'));
      await page.waitForSelector('[data-scan-top]');
      await page.click('[data-scan-top]');
      await page.waitForSelector('form[data-form="qty"]', { timeout: 10000 });
      assert.equal(await sheetTitle(page), 'Lasagnes à la bolognaise');
      assert.equal(await page.$eval('[name="qty"]', (i) => Number(i.value)), 300);
      assert.match(await page.$eval('[data-preview]', (e) => e.textContent), /405/);
      await page.click('form[data-form="qty"] button.primary');
      await page.waitForTimeout(1200);
      assert.match(await page.$eval('.timeline', (e) => e.innerText), /Lasagnes à la bolognaise · 300 g/);
    } },
    { name: 'produit inconnu : fiche à recopier, code-barres prérempli, puis quantité', fn: async ({ page }) => {
      await stubScanner(page, ['2000000000017']);
      await page.evaluate(() => journalAdd('soir'));
      await page.click('[data-scan-top]');
      await page.waitForSelector('form[data-form="perso"]', { timeout: 10000 });
      assert.match(await H.toastText(page), /inconnu/);
      assert.equal(await page.$eval('form[data-form="perso"] [name="ean"]', (i) => i.value), '2000000000017');
      await page.fill('form[data-form="perso"] [name="name"]', 'Produit test maison');
      for (const [k, v] of [['kcal', '200'], ['prot', '5'], ['gluc', '30'], ['suc', '10'], ['lip', '6'], ['ags', '2'], ['fib', '1'], ['sel', '0.5'], ['serving_g', '50']]) await page.fill(`form[data-form="perso"] [name="${k}"]`, v);
      await page.click('form[data-form="perso"] button.primary');
      await page.waitForSelector('form[data-form="qty"]');
      assert.equal(await sheetTitle(page), 'Produit test maison');
      assert.equal(await page.$eval('[name="qty"]', (i) => Number(i.value)), 50);
      await page.click('form[data-form="qty"] button.primary');
      await page.waitForTimeout(1200);
      assert.match(await page.$eval('.timeline', (e) => e.innerText), /Produit test maison/);
      assert.equal(await page.evaluate(() => state.perso.length), 1);
    } },
    { name: 'produit connu sans valeurs nutritionnelles : fiche préremplie avec le nom', fn: async ({ page }) => {
      await stubScanner(page, ['3000000000001']);
      await page.evaluate(() => journalAdd('gouter'));
      await page.click('[data-scan-top]');
      await page.waitForSelector('form[data-form="perso"]', { timeout: 10000 });
      assert.equal(await page.$eval('form[data-form="perso"] [name="name"]', (i) => i.value), 'Biscuits sans valeurs renseignées');
      await H.closeSheets(page);
    } },
    { name: 'la fiche maison est retrouvée au scan suivant, sans appel réseau', fn: async ({ page }) => {
      let calls = 0;
      page.on('request', (r) => { if (/openfoodfacts\.org/.test(r.url())) calls++; });
      await stubScanner(page, ['2000000000017']);
      await page.evaluate(() => journalAdd('midi'));
      await page.click('[data-scan-top]');
      await page.waitForSelector('form[data-form="qty"]');
      assert.equal(await sheetTitle(page), 'Produit test maison');
      assert.equal(calls, 0);
      await H.closeSheets(page);
    } },
  ],
};
