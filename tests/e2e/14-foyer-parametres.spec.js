const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers');

module.exports = {
  name: 'Foyer et paramètres',
  after: async ({ page }) => {
    await page.evaluate(async () => {
      for (const m of state.members.filter((x) => /Invité test/.test(x.nom))) await Data.deleteMember(m.id);
      for (const r of state.recipes.filter((x) => /Recette importée test/.test(x.title))) await Data.deleteRecipe(r.id);
      await Data.saveSettings({ store_name: 'Super U Porte de Savoie Montmélian', store_slug: 'superu-montmelian', default_servings: 3 });
      render();
    });
  },
  tests: [
    { name: 'paramètres : magasin et portions par défaut', fn: async ({ page }) => {
      await page.click('[data-act="settings"]');
      await page.waitForSelector('form[data-form="settings"]');
      await page.fill('form[data-form="settings"] [name="store_name"]', 'Super U Test');
      await page.fill('form[data-form="settings"] [name="default_servings"]', '4');
      await page.click('form[data-form="settings"] button.primary');
      await page.waitForTimeout(1200);
      const s = await page.evaluate(() => ({ ...state.settings }));
      assert.equal(s.store_name, 'Super U Test');
      assert.equal(Number(s.default_servings), 4);
      await H.closeSheets(page);
    } },
    { name: 'ajouter un membre : besoin calculé, puis modifier son objectif d\'eau, puis le retirer', fn: async ({ page }) => {
      await page.evaluate(() => openFoyer());
      await page.waitForSelector('[data-x="add"]');
      await page.click('[data-x="add"]');
      await page.waitForSelector('form[data-form="member"]');
      await page.fill('form[data-form="member"] [name="nom"]', 'Invité test');
      await page.selectOption('form[data-form="member"] [name="sexe"]', 'H');
      await page.fill('form[data-form="member"] [name="naissance"]', '2000-01-01');
      await page.fill('form[data-form="member"] [name="poids_kg"]', '70');
      await page.fill('form[data-form="member"] [name="taille_cm"]', '175');
      await page.dispatchEvent('form[data-form="member"] [name="taille_cm"]', 'input');
      assert.match(await page.$eval('[data-calc]', (e) => e.textContent), /kcal\/jour/);
      await page.click('form[data-form="member"] button.primary');
      await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(() => state.members.length), 4);
      const id = await page.evaluate(() => state.members.find((m) => m.nom === 'Invité test').id);
      await page.click(`.sheet-wrap.open [data-id="${id}"]`);
      await page.waitForSelector('form[data-form="member"] [name="objectif_eau_ml"]');
      await page.fill('form[data-form="member"] [name="objectif_eau_ml"]', '1500');
      await page.click('form[data-form="member"] button.primary');
      await page.waitForTimeout(1500);
      assert.equal(await page.evaluate((id) => Number(memberById(id).objectif_eau_ml), id), 1500);
      await page.click(`.sheet-wrap.open [data-id="${id}"]`);
      await page.waitForSelector('[data-x="del"]');
      await page.click('[data-x="del"]');
      await page.waitForSelector('[data-x="yes"]');
      await page.click('[data-x="yes"]');
      await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(() => state.members.length), 3);
      await H.closeSheets(page);
    } },
    { name: 'rappels : la feuille liste les préférences', fn: async ({ page }) => {
      await page.evaluate(() => openRappels());
      await page.waitForSelector('.sheet-wrap.open');
      const txt = await page.$eval('.sheet-wrap.open', (e) => e.textContent);
      assert.match(txt, /Rappels sur cet appareil|notifications ne sont pas disponibles/);
      await H.closeSheets(page);
    } },
    { name: 'partage du foyer : code d\'invitation visible', fn: async ({ page }) => {
      await page.evaluate(() => openFoyerComptes());
      const code = await page.evaluate(() => state.foyer.code_invitation);
      await page.waitForFunction((c) => (document.querySelector('.sheet-wrap.open')?.textContent || '').includes(c), code, { timeout: 15000 });
      await H.closeSheets(page);
    } },
    { name: 'magasin non choisi : demandé une fois, adresse collée → identifiant et nom devinés', fn: async ({ page }) => {
      await page.evaluate(async () => { await Data.saveSettings({ store_name: '', store_slug: '' }); localStorage.removeItem(`magasin:demande:${foyer()}`); demanderMagasinSiBesoin(); });
      await page.waitForSelector('.sheet-wrap.open form[data-form="magasin"]', { timeout: 5000 });
      await page.fill('.sheet-wrap.open [name="adresse"]', 'https://www.coursesu.com/drive-superu-cognin');
      assert.equal(await page.$eval('.sheet-wrap.open [name="nom"]', (i) => i.value), 'Super U Cognin');
      await page.click('.sheet-wrap.open form[data-form="magasin"] button.primary');
      await page.waitForTimeout(1200);
      assert.deepEqual(await page.evaluate(() => [state.settings.store_slug, state.settings.store_name]), ['superu-cognin', 'Super U Cognin']);
      // Déjà demandé sur cet appareil : pas de nouvelle demande, même sans magasin.
      await page.evaluate(async () => { await Data.saveSettings({ store_name: '', store_slug: '' }); demanderMagasinSiBesoin(); });
      await page.waitForTimeout(1800);
      assert.equal(await page.$('.sheet-wrap.open form[data-form="magasin"]'), null);
      // Panier U sans magasin : le choix du magasin passe d'abord.
      await page.evaluate(() => panierUSheet([]));
      await page.waitForSelector('.sheet-wrap.open form[data-form="magasin"]');
      await H.closeSheets(page);
      await page.evaluate(async () => { await Data.saveSettings({ store_name: 'Super U Porte de Savoie Montmélian', store_slug: 'superu-montmelian' }); render(); });
    } },
    { name: 'supprimer mon compte : confirmation écrite, appel au serveur, déconnexion (simulés)', fn: async ({ page }) => {
      await page.evaluate(() => {
        window.__appels = [];
        window.__invoke = Foyer.invoke; window.__signOut = db.auth.signOut;
        Foyer.invoke = async (nom, corps) => { window.__appels.push([nom, corps]); return { ok: true }; };
        db.auth.signOut = async () => { window.__appels.push(['signOut']); return {}; };
        openFoyerComptes();
      });
      await page.waitForSelector('.sheet-wrap.open details[data-supprimer]');
      await page.click('.sheet-wrap.open details[data-supprimer] summary');
      assert.match(await page.$eval('.sheet-wrap.open details[data-supprimer]', (e) => e.textContent), /dernier compte de ce foyer|Le foyer continue/);
      await page.fill('.sheet-wrap.open [data-form="supprimer-compte"] [name="confirmation"]', 'oui');
      await page.click('.sheet-wrap.open [data-form="supprimer-compte"] button');
      await page.waitForTimeout(400);
      assert.deepEqual(await page.evaluate(() => window.__appels), []);
      await page.fill('.sheet-wrap.open [data-form="supprimer-compte"] [name="confirmation"]', 'supprimer');
      await page.click('.sheet-wrap.open [data-form="supprimer-compte"] button');
      await page.waitForTimeout(800);
      assert.deepEqual(await page.evaluate(() => window.__appels), [['supprimer-compte', { confirmation: 'SUPPRIMER' }], ['signOut']]);
      await page.evaluate(() => { Foyer.invoke = window.__invoke; db.auth.signOut = window.__signOut; });
      await H.closeSheets(page);
    } },
    { name: 'export JSON puis import', fn: async ({ page }) => {
      await page.click('[data-act="settings"]');
      await page.waitForSelector('[data-x="export"]');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('[data-x="export"]')]);
      const file = path.join(__dirname, '..', '.out', 'export-test.json');
      await dl.saveAs(file);
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.ok(Array.isArray(data.recipes) && data.recipes.length >= 3);
      assert.equal(data.app, 'Tribu');
      const imp = { app: 'Miam & moi', version: 1, recipes: [{ ...data.recipes[0], id: 'import-1', title: 'Recette importée test' }], meal_plan: [], product_links: [] };
      const impFile = path.join(__dirname, '..', '.out', 'import-test.json');
      fs.writeFileSync(impFile, JSON.stringify(imp));
      const n0 = await page.evaluate(() => state.recipes.length);
      await page.setInputFiles('[data-x="import"]', impFile);
      await page.waitForSelector('[data-x="yes"]');
      await page.click('[data-x="yes"]');
      await page.waitForFunction((n) => state.recipes.length === n + 1, n0, { timeout: 15000 });
      assert.ok(await page.evaluate(() => state.recipes.some((r) => r.title === 'Recette importée test')));
      await H.closeSheets(page);
    } },
  ],
};
