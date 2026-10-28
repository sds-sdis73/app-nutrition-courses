const assert = require('node:assert/strict');
const H = require('../helpers');

const shells = (page) => page.evaluate(() => companionOf(journalMember()).coquillages);
const comp = (page) => page.evaluate(() => ({ ...companionOf(journalMember()) }));

module.exports = {
  name: 'Compagnon et boutique',
  tests: [
    { name: 'visite du jour : +5 une seule fois', fn: async ({ page }) => {
      assert.equal(await shells(page), 100);
      await page.evaluate(() => Rewards.daily());
      await page.waitForTimeout(600);
      assert.equal(await shells(page), 105);
      await page.evaluate(() => Rewards.daily());
      await page.waitForTimeout(600);
      assert.equal(await shells(page), 105);
    } },
    { name: 'câlins : +1, trois fois par jour au plus', fn: async ({ page }) => {
      await page.evaluate(() => { Pet.idle = () => {}; }); // pas de bulle « au repos » pendant le test
      for (let i = 0; i < 4; i++) { await page.click('[data-act="pet"]'); await page.waitForTimeout(500); }
      await page.waitForTimeout(800);
      assert.equal(await shells(page), 108);
      assert.match(await page.$eval('[data-bubble]', (e) => e.textContent), /chatouille|Encore|adore|câlin|Ronron/);
    } },
    { name: 'friandise : débitée, comptée, réaction « miam »', fn: async ({ page }) => {
      await page.click('[data-act="nourrir"]');
      await page.waitForSelector('[data-buy="pomme"]');
      await page.click('[data-buy="pomme"]');
      await page.waitForTimeout(1500);
      const c = await comp(page);
      assert.equal(c.coquillages, 103);
      assert.equal(c.friandises, 1);
      assert.equal(await page.evaluate(() => sheets.length), 0, 'la boutique se ferme pour voir la réaction');
    } },
    { name: 'tenue : achat puis mettre / retirer', fn: async ({ page }) => {
      await page.click('[data-act="boutique"]');
      await page.waitForSelector('[data-buy="bonnet"]');
      await page.click('[data-buy="bonnet"]');
      await page.waitForTimeout(1000);
      assert.equal(await shells(page), 83);
      await page.waitForSelector('[data-wear="bonnet"]');
      assert.deepEqual((await comp(page)).accessoires, ['bonnet']);
      await page.click('[data-wear="bonnet"]');
      await page.waitForTimeout(1000);
      assert.deepEqual((await comp(page)).accessoires, ['!bonnet']);
      await page.click('[data-wear="bonnet"]');
      await page.waitForTimeout(1000);
      assert.deepEqual((await comp(page)).accessoires, ['bonnet']);
      assert.ok(await page.$('.sheet-wrap.open .bq-item'), 'cartes de la boutique affichées');
    } },
    { name: 'décor : achat de la plage puis retour au jardin', fn: async ({ page }) => {
      await page.click('[data-tab-shop="fonds"]');
      await page.waitForSelector('[data-buy="fond:plage"]');
      await page.click('[data-buy="fond:plage"]');
      await page.waitForTimeout(1000);
      let c = await comp(page);
      assert.equal(c.coquillages, 23);
      assert.equal(c.fond, 'plage');
      await page.click('[data-fond="jardin"]');
      await page.waitForTimeout(800);
      c = await comp(page);
      assert.equal(c.fond, 'jardin');
      assert.ok(c.accessoires.includes('fond:plage'), 'le décor acheté reste possédé');
      await H.closeSheets(page);
      assert.ok(await page.$('[data-scene] .scene-bg'));
    } },
    { name: 'réinitialisation : compteurs à zéro, cadeau de bienvenue non redonné', fn: async ({ page }) => {
      await page.evaluate(() => compagnonSettings());
      await page.waitForSelector('[data-x="reset"]');
      await page.click('[data-x="reset"]');
      await page.waitForSelector('[data-x="yes"]');
      await page.click('[data-x="yes"]');
      await page.waitForTimeout(1200);
      assert.equal(await shells(page), 0);
      await page.evaluate(() => Rewards.daily());
      await page.waitForTimeout(800);
      assert.equal(await shells(page), 0, 'ni bienvenue ni visite une seconde fois');
    } },
  ],
};
