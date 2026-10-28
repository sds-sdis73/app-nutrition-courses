const assert = require('node:assert/strict');
const H = require('../helpers');

const NEW = '2099-01-01.1';
const serveVersion = (page, version) => page.route((url) => /version\.json/.test(url.pathname), (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version }) }));

module.exports = {
  name: 'Mise à jour de l\'application',
  tests: [
    { name: 'une feuille est ouverte : bannière « Nouvelle version », pas de rechargement', fn: async ({ page }) => {
      await serveVersion(page, NEW);
      await page.evaluate(() => { store.set('updateTried', null); openSheet('<p>saisie en cours</p>'); });
      await page.evaluate(() => Updater.check());
      await page.waitForSelector('#update-banner', { timeout: 10000 });
      assert.equal(await page.evaluate(() => Updater.pending), NEW);
      assert.match(await page.$eval('#update-banner', (e) => e.textContent), /Nouvelle version disponible/);
      await H.closeSheets(page);
    } },
    { name: 'sans feuille : rechargement, puis bannière si l\'ancienne version est toujours servie', fn: async ({ page }) => {
      await page.evaluate(() => { document.getElementById('update-banner')?.remove(); store.set('updateTried', null); });
      // Rechargement par le service worker (cache rafraîchi) ou, sans lui, par une adresse avec ?v= : dans les deux cas la page se recharge.
      await Promise.all([page.waitForNavigation({ timeout: 20000 }), page.evaluate(() => Updater.check())]);
      await H.waitLoaded(page);
      await page.waitForSelector('#update-banner', { timeout: 15000 });
      assert.equal(await page.evaluate(() => store.get('updateTried', null)), NEW);
      assert.doesNotMatch(page.url(), /\?v=/, 'le paramètre v est retiré de l\'adresse');
    } },
  ],
};
