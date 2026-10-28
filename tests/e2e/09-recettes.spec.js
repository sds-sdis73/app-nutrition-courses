const assert = require('node:assert/strict');
const H = require('../helpers');

const count = (page) => page.evaluate(() => state.recipes.length);

module.exports = {
  name: 'Recettes : création, import, avis, duplication, mode cuisine',
  after: async ({ page }) => {
    await page.evaluate(async () => { for (const r of state.recipes.filter((x) => /test|importé/i.test(x.title))) await Data.deleteRecipe(r.id); render(); });
  },
  tests: [
    { name: 'nouvelle recette avec ingrédients et étapes, Nutri-Score calculé', fn: async ({ page }) => {
      const n0 = await count(page);
      await H.openTab(page, 'recettes');
      await page.click('[data-act="new-recipe"]');
      await page.waitForSelector('#ed [data-f="title"]');
      await page.fill('#ed [data-f="title"]', 'Omelette test');
      for (const [qty, unit, name] of [['3', 'pièce', 'œufs'], ['10', 'g', 'beurre'], ['30', 'g', 'emmental râpé']]) {
        await page.fill('#ed [data-ed-form="ing"] [name="qty"]', qty);
        await page.selectOption('#ed [data-ed-form="ing"] [name="unit"]', unit);
        await page.fill('#ed [data-ed-form="ing"] [name="ingname"]', name);
        await page.click('#ed [data-ed-form="ing"] button');
        await page.waitForTimeout(250);
      }
      assert.equal(await page.$$eval('#ed .ed-ing[data-i]', (l) => l.length), 3);
      await page.click('#ed [data-ed="step-add"]');
      await page.fill('#ed .ed-step[data-s="0"] [data-h="text"]', 'Battre les œufs avec une pincée de sel.');
      await page.click('#ed [data-ed="step-add"]');
      await page.fill('#ed .ed-step[data-s="1"] [data-h="text"]', 'Cuire à la poêle dans le beurre 4 min.');
      await page.fill('#ed .ed-step[data-s="1"] [data-h="min"]', '4');
      await page.click('#ed [data-ed="save"]');
      await page.waitForFunction((n) => state.recipes.length === n + 1, n0, { timeout: 10000 });
      const r = await page.evaluate(() => state.recipes.find((x) => x.title === 'Omelette test'));
      assert.equal(r.ingredients.length, 3);
      assert.equal(r.steps.length, 2);
      assert.equal(Number(r.steps[1].min), 4);
      await H.closeSheets(page);
      await page.click(`[data-act="open-recipe"][data-id="${r.id}"]`);
      await page.waitForSelector('#rd');
      const txt = await page.$eval('#rd', (e) => e.textContent);
      assert.match(txt, /Nutri-Score/);
      assert.match(txt, /kcal/);
    } },
    { name: 'avis « on adore » et favori', fn: async ({ page }) => {
      await page.click('#rd [data-avis="adore"]');
      await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => state.recipes.find((x) => x.title === 'Omelette test').avis), 'adore');
      await page.click('#rd [data-act="toggle-fav"]');
      await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => state.recipes.find((x) => x.title === 'Omelette test').favorite), true);
    } },
    { name: 'mode cuisine : étapes, retour, fermeture par Échap', fn: async ({ page }) => {
      await page.click('#rd [data-act="cook-mode"]');
      await page.waitForSelector('.cook');
      assert.match(await page.$eval('.cook .step-text', (e) => e.textContent), /Battre/);
      await page.click('.cook [data-c="next"]');
      assert.match(await page.$eval('.cook .step-text', (e) => e.textContent), /Cuire/);
      assert.ok(await page.$('.cook #tm'), 'minuteur affiché sur une étape chronométrée');
      await page.click('.cook [data-c="prev"]');
      assert.match(await page.$eval('.cook .step-text', (e) => e.textContent), /Battre/);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      assert.equal(await page.$('.cook'), null, 'Échap ferme le mode cuisine');
      assert.ok(await page.$('#rd'), 'la fiche recette est toujours ouverte');
      await H.closeSheets(page);
    } },
    { name: 'dupliquer puis supprimer la copie', fn: async ({ page }) => {
      const n0 = await count(page);
      const id = await page.evaluate(() => state.recipes.find((x) => x.title === 'Omelette test').id);
      await page.evaluate((id) => recipeMenu(id), id);
      await page.click('.sheet-wrap.open [data-m="dup"]');
      await page.waitForFunction((n) => state.recipes.length === n + 1, n0, { timeout: 10000 });
      await H.closeSheets(page);
      const copy = await page.evaluate(() => state.recipes.find((x) => /Omelette test/.test(x.title) && x.title !== 'Omelette test'));
      assert.ok(copy, 'copie créée');
      await page.evaluate((id) => recipeMenu(id), copy.id);
      await page.click('.sheet-wrap.open [data-m="del"]');
      await page.waitForSelector('[data-x="yes"]');
      await page.click('[data-x="yes"]');
      await page.waitForFunction((n) => state.recipes.length === n, n0, { timeout: 10000 });
      await H.closeSheets(page);
    } },
    { name: 'import depuis une URL (réponse fixe) puis enregistrement', fn: async ({ page }) => {
      const n0 = await count(page);
      await H.openTab(page, 'recettes');
      await page.click('[data-act="new-recipe"]');
      await page.waitForSelector('#ed [data-ed="import"]');
      await page.click('#ed [data-ed="import"]');
      await page.waitForSelector('form[data-form="import"] [name="url"]');
      await page.fill('form[data-form="import"] [name="url"]', 'https://exemple.test/gratin-courgettes');
      await page.click('form[data-form="import"] button.primary');
      await page.waitForFunction(() => document.querySelector('#ed [data-f="title"]')?.value === 'Gratin de courgettes importé', null, { timeout: 15000 });
      assert.equal(await page.$$eval('#ed .ed-ing[data-i]', (l) => l.length), 5);
      await page.click('#ed [data-ed="save"]');
      await page.waitForFunction((n) => state.recipes.length === n + 1, n0, { timeout: 10000 });
      await H.closeSheets(page);
    } },
    { name: 'recherche et puces de filtre', fn: async ({ page }) => {
      await H.openTab(page, 'recettes');
      await page.fill('[data-input="recipe-q"]', 'omelette');
      await page.waitForTimeout(300);
      assert.equal(await page.$$eval('#recipe-results .recipe-card', (l) => l.length), 1);
      await page.fill('[data-input="recipe-q"]', '');
      await page.waitForTimeout(300);
      await page.click('[data-act="recipe-chip"][data-v="favoris"]');
      await page.waitForTimeout(300);
      const titles = await page.$$eval('#recipe-results .recipe-card', (l) => l.map((c) => c.textContent));
      assert.ok(titles.length === 1 && /Omelette test/.test(titles[0]), titles.join(' | '));
      await page.click('[data-act="recipe-chip"][data-v="tous"]');
    } },
  ],
};
