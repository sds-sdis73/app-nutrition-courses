const assert = require('node:assert/strict');
const H = require('../helpers');

const meal = (page, d, s) => page.evaluate(([d, s]) => { const m = state.plan.find((x) => x.day === d && x.slot === s); return m ? { ...m } : null; }, [d, s]);
const restePortions = (page) => page.evaluate(() => Number(state.restes[0]?.portions));

module.exports = {
  name: 'Planning de la semaine',
  tests: [
    { name: 'ajouter une recette à un créneau vide', fn: async ({ page }) => {
      await H.openTab(page, 'planning');
      assert.equal(await page.$$eval('.day', (l) => l.length), 7);
      await page.click('[data-act="slot"][data-d="3"][data-s="midi"]');
      await page.waitForSelector('#pick-list [data-pick]');
      await page.fill('[data-pick-q]', 'poulet');
      await page.waitForTimeout(200);
      await page.click('#pick-list [data-pick]');
      await page.waitForTimeout(1200);
      const m = await meal(page, 3, 'midi');
      assert.ok(m, 'repas créé');
      assert.match(await page.evaluate((id) => recipeById(id).title, m.recipe_id), /Poulet/);
    } },
    { name: 'qui mange : décocher un membre, ajouter un invité', fn: async ({ page }) => {
      await page.click('[data-act="slot"][data-d="3"][data-s="midi"]');
      await page.waitForSelector('[data-eater]');
      await page.uncheck('[data-eater]');
      await page.waitForTimeout(1000);
      let m = await meal(page, 3, 'midi');
      assert.equal(m.eaters.length, 2);
      await page.click('[data-g="1"]');
      await page.waitForTimeout(1000);
      m = await meal(page, 3, 'midi');
      assert.equal(m.guests, 1);
      await H.closeSheets(page);
    } },
    { name: 'déplacer le repas vers un autre créneau', fn: async ({ page }) => {
      await page.click('[data-act="slot"][data-d="3"][data-s="midi"]');
      await page.click('.sheet-wrap.open [data-m="move"]');
      await page.waitForTimeout(300);
      assert.ok(await page.evaluate(() => !!state.moving));
      // Le bandeau « Touchez la case de destination » peut recouvrir la case visée : clic déclenché directement sur l'élément.
      await page.$eval('[data-act="slot"][data-d="4"][data-s="soir"]', (el) => el.click());
      await page.waitForTimeout(1500);
      assert.equal(await meal(page, 3, 'midi'), null);
      const m = await meal(page, 4, 'soir');
      assert.ok(m && m.guests === 1 && m.eaters.length === 2, 'mangeurs et invités conservés');
    } },
    { name: 'reste au congélateur : placé dans le planning, portions décomptées, non doublées au déplacement, rendues au changement de recette', fn: async ({ page }) => {
      const salad = await page.evaluate(() => state.recipes.find((r) => /quinoa/i.test(r.title)).id);
      await page.evaluate(async (rid) => { await Data.addReste({ recipe_id: rid, portions: 4, stockage: 'congel', fait_le: isoDate(new Date()), dlc: isoDate(addDays(new Date(), 90)) }); render(); }, salad);
      assert.equal(await restePortions(page), 4);
      await page.click('[data-act="slot"][data-d="5"][data-s="midi"]');
      await page.waitForSelector('[data-reste]');
      await page.click('[data-reste]');
      await page.waitForTimeout(1500);
      const m = await meal(page, 5, 'midi');
      assert.ok(m.reste_id);
      const used = await page.evaluate((id) => mealServings(state.plan.find((x) => x.id === id)), m.id);
      const left = Math.round((4 - used) * 100) / 100;
      assert.equal(await restePortions(page), left);
      // Déplacement : les portions ne doivent pas être rendues puis redécomptées.
      await page.click('[data-act="slot"][data-d="5"][data-s="midi"]');
      await page.click('.sheet-wrap.open [data-m="move"]');
      await page.$eval('[data-act="slot"][data-d="6"][data-s="midi"]', (el) => el.click());
      await page.waitForTimeout(1500);
      assert.equal(await restePortions(page), left, 'portions inchangées après déplacement');
      assert.ok((await meal(page, 6, 'midi')).reste_id);
      // Changement de recette : les portions reviennent au reste.
      await page.click('[data-act="slot"][data-d="6"][data-s="midi"]');
      await page.click('.sheet-wrap.open [data-m="change"]');
      await page.waitForSelector('#pick-list [data-pick]');
      await page.click('#pick-list [data-pick]');
      await page.waitForTimeout(1500);
      assert.equal(await restePortions(page), 4, 'portions rendues');
      assert.equal((await meal(page, 6, 'midi')).reste_id, null);
    } },
    { name: 'retirer un repas', fn: async ({ page }) => {
      await page.click('[data-act="slot"][data-d="6"][data-s="midi"]');
      await page.click('.sheet-wrap.open [data-m="del"]');
      await page.waitForTimeout(1200);
      assert.equal(await meal(page, 6, 'midi'), null);
    } },
    { name: 'menu de la semaine : remplir au hasard (sans réordonner les recettes), puis vider', fn: async ({ page }) => {
      const order = await page.evaluate(() => state.recipes.map((r) => r.id));
      await page.click('[data-act="week-menu"]');
      await page.click('.sheet-wrap.open [data-m="random"]');
      await page.waitForFunction(() => state.plan.length === 14, null, { timeout: 20000 });
      assert.deepEqual(await page.evaluate(() => state.recipes.map((r) => r.id)), order, 'ordre des recettes conservé');
      await page.click('[data-act="week-menu"]');
      await page.click('.sheet-wrap.open [data-m="clear"]');
      await page.waitForSelector('[data-x="yes"]');
      await page.click('[data-x="yes"]');
      await page.waitForFunction(() => state.plan.length === 0, null, { timeout: 20000 });
    } },
    { name: '« On mange quoi ? » depuis l\'accueil planifie le repas du moment', fn: async ({ page }) => {
      await H.openTab(page, 'aujourdhui');
      await page.click('[data-act="suggest"]');
      await page.waitForSelector('.sheet-wrap.open [data-rid]');
      await page.click('.sheet-wrap.open [data-rid]');
      await page.waitForTimeout(1500);
      assert.ok(await meal(page, 2, 'midi'), 'déjeuner du mercredi planifié (il est 12 h 05)');
      assert.match(await page.$eval('.timeline', (e) => e.innerText), /Déjeuner/);
    } },
  ],
};
