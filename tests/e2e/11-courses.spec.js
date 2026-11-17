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
    { name: 'panier Courses U : article associé, quantité, lien vers le drive, favori qui ajoute au panier', fn: async ({ page, ctx }) => {
      await page.click('[data-act="link-item"]');
      await page.waitForSelector('form[data-form="link"] [name="url"]');
      await page.fill('form[data-form="link"] [name="url"]', 'https://www.coursesu.com/p/quinoa-bio-500g/7634896.html');
      await page.click('form[data-form="link"] button.primary');
      await page.waitForTimeout(1500);
      assert.ok(await page.evaluate(() => Object.values(state.links).some((l) => l.pid === '7634896')));
      await page.click('[data-act="panier-u"]');
      await page.waitForSelector('.sheet-wrap.open [data-x="ouvrir"]');
      assert.match(await page.$eval('.sheet-wrap.open', (e) => e.textContent), /1 article prêt/);
      assert.match(await page.$eval('.sheet-wrap.open', (e) => e.textContent), /Produit de 500 g/);
      await page.click('.sheet-wrap.open [data-x="plus"]');
      const href = await page.$eval('.sheet-wrap.open [data-x="ouvrir"]', (a) => a.getAttribute('href'));
      assert.match(href, /^https:\/\/www\.coursesu\.com\/drive-[a-z0-9-]+#tribu-panier=7634896\*2$/);
      const favori = await page.evaluate(() => favoriPanierU());
      assert.match(favori, /^javascript:/);
      await page.evaluate(async () => { for (const k of Object.keys(state.links)) await Data.deleteLink(k); for (const k of Object.keys(localStorage)) if (k.includes('panierU:')) localStorage.removeItem(k); });
      await H.closeSheets(page);
      // Faux coursesu.com : le favori lit l'ancre, récupère le jeton de la page et poste chaque produit.
      const cu = await ctx.newPage();
      const envois = [];
      await cu.route('https://www.coursesu.com/**', async (route) => {
        const req = route.request();
        if (req.url().includes('Cart-AddProduct')) { envois.push(req.postData()); return route.fulfill({ contentType: 'application/json', body: '{"success":true}' }); }
        return route.fulfill({ contentType: 'text/html', body: '<html><body><form><input type="hidden" name="csrf_token" value="jeton-de-test"></form></body></html>' });
      });
      await cu.goto('https://www.coursesu.com/drive-superu-cognin#tribu-panier=7634896*2,403997*1');
      await cu.evaluate((code) => { (0, eval)(decodeURIComponent(code.slice('javascript:'.length))); }, favori);
      await cu.waitForFunction(() => /ajouté/.test(document.body.textContent), null, { timeout: 8000 });
      assert.equal(envois.length, 2);
      const p1 = new URLSearchParams(envois[0]);
      assert.equal(p1.get('pid'), '7634896');
      assert.equal(p1.get('Quantity'), '2');
      assert.equal(p1.get('csrf_token'), 'jeton-de-test');
      assert.match(await cu.evaluate(() => document.body.textContent), /2 produits ajoutés au panier/);
      await cu.close();
    } },
    { name: 'panier Courses U : après une association, retour à la liste des articles sans produit', fn: async ({ page }) => {
      await page.click('[data-act="panier-u"]');
      await page.waitForSelector('.sheet-wrap.open details[data-sans] [data-x="lier"]');
      const avant = await page.$$eval('.sheet-wrap.open details[data-sans] [data-x="lier"]', (l) => l.length);
      await page.click('.sheet-wrap.open details[data-sans] [data-x="lier"]');
      await page.waitForSelector('form[data-form="link"] [name="url"]');
      await page.fill('form[data-form="link"] [name="url"]', 'https://www.coursesu.com/p/produit-test-500g/1234567.html');
      await page.click('form[data-form="link"] button.primary');
      await page.waitForSelector('.sheet-wrap.open details[data-sans][open]', { timeout: 5000 });
      assert.equal(await page.$$eval('.sheet-wrap.open details[data-sans] [data-x="lier"]', (l) => l.length), avant - 1);
      assert.match(await page.$eval('.sheet-wrap.open', (e) => e.textContent), /1 article prêt/);
      // Changer le produit d'un article déjà associé : fenêtre préremplie, puis retour à la liste.
      await page.click('.sheet-wrap.open .pu-changer');
      await page.waitForSelector('form[data-form="link"] [name="url"]');
      assert.match(await page.$eval('form[data-form="link"] [name="url"]', (i) => i.value), /1234567/);
      await page.fill('form[data-form="link"] [name="url"]', 'https://www.coursesu.com/p/autre-produit-1kg/7654321.html');
      await page.click('form[data-form="link"] button.primary');
      await page.waitForSelector('.sheet-wrap.open .pu-changer', { timeout: 5000 });
      assert.match(await page.$eval('.sheet-wrap.open', (e) => e.textContent), /produit de 1 kg/i);
      assert.ok(await page.evaluate(() => Object.values(state.links).some((l) => l.pid === '7654321')));
      // Annuler une association ramène aussi à la liste.
      await page.click('.sheet-wrap.open details[data-sans] [data-x="lier"]');
      await page.waitForSelector('form[data-form="link"]');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.sheet-wrap.open details[data-sans][open]', { timeout: 5000 });
      await page.evaluate(async () => { for (const k of Object.keys(state.links)) await Data.deleteLink(k); });
      await H.closeSheets(page);
      await page.evaluate(() => render());
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
