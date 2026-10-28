const assert = require('node:assert/strict');
const H = require('../helpers');

module.exports = {
  name: 'Connexion et déconnexion',
  noLogin: true,
  tests: [
    { name: 'mauvais mot de passe : message clair, pas de connexion', fn: async ({ page, env }) => {
      await page.waitForSelector('[data-form="auth"]');
      await page.fill('[data-form="auth"] [name="email"]', env.TEST_EMAIL);
      await page.fill('[data-form="auth"] [name="password"]', 'mauvais-mdp');
      await page.click('[data-form="auth"] button.primary');
      await page.waitForFunction(() => /incorrect|invalid/i.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 15000 });
      assert.ok(await page.$('[data-form="auth"]'), 'le formulaire reste affiché');
    } },
    { name: '« Créer un compte » bascule le formulaire, « Mot de passe oublié » ouvre une feuille', fn: async ({ page }) => {
      await page.click('[data-auth-mode="signup"]');
      assert.match(await page.$eval('[data-form="auth"] button.primary', (b) => b.textContent), /Créer mon compte/);
      assert.equal(await page.$('[data-forgot]'), null);
      await page.click('[data-auth-mode="login"]');
      await page.click('[data-forgot]');
      await page.waitForSelector('.sheet-wrap.open');
      assert.match(await page.$eval('.sheet-wrap.open', (e) => e.textContent), /administrateur de votre foyer/);
      await H.closeSheets(page);
    } },
    { name: 'connexion : données chargées, accueil affiché', fn: async ({ page, env }) => {
      await page.check('[data-show-pass]');
      assert.equal(await page.$eval('[data-form="auth"] [name="password"]', (i) => i.type), 'text');
      await page.fill('[data-form="auth"] [name="email"]', env.TEST_EMAIL);
      await page.fill('[data-form="auth"] [name="password"]', env.TEST_PASSWORD);
      await page.click('[data-form="auth"] button.primary');
      await H.waitLoaded(page);
      await page.waitForTimeout(800);
      await H.closeSheets(page);
      assert.equal(await page.evaluate(() => state.tab), 'aujourdhui');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Miam & moi');
      assert.ok(await page.$('.tabbar button[aria-current="page"]'));
      assert.ok(await page.evaluate(() => state.members.length >= 3 && state.recipes.length >= 3), 'foyer de test peuplé');
    } },
    { name: 'déconnexion depuis les paramètres', fn: async ({ page }) => {
      await page.click('[data-act="settings"]');
      await page.waitForSelector('[data-x="logout"]');
      await page.click('[data-x="logout"]');
      await page.waitForSelector('[data-form="auth"]', { timeout: 15000 });
      assert.equal(await page.evaluate(() => state.user), null);
      assert.equal(await page.evaluate(() => Pet.timer), null, 'le compagnon est arrêté');
    } },
  ],
};
