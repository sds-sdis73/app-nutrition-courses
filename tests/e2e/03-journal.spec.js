const assert = require('node:assert/strict');
const H = require('../helpers');

const entries = (page) => page.$$eval('.timeline .tl-food', (l) => l.map((x) => x.textContent.trim()));
const eatenRing = (page) => page.$eval('.ring b', (e) => e.textContent);

module.exports = {
  name: 'Journal : plats, aliments, habituels, recettes',
  tests: [
    { name: 'un plat (poke bowl, ½ portion) apparaît tout de suite dans le fil et l\'anneau', fn: async ({ page }) => {
      assert.equal((await entries(page)).length, 0);
      await page.click('.tl-item.repas [data-act="journal-add"][data-slot="midi"]');
      await page.click('[data-mode="plat"]');
      await page.waitForSelector('[data-plat]');
      await page.fill('[data-plat-q]', 'poke');
      await page.waitForTimeout(300);
      assert.match(await page.$eval('[data-plat] b', (e) => e.textContent), /^Poke bowl/);
      await page.click('[data-plat]');
      await page.waitForSelector('form[data-form="qty"]');
      await page.click('[data-q]:first-child');
      const q = await page.$eval('[name="qty"]', (i) => Number(i.value));
      assert.equal(q, 215);
      await page.click('form[data-form="qty"] button.primary');
      await page.waitForTimeout(1500);
      const e = await entries(page);
      assert.equal(e.length, 1);
      assert.match(e[0], /Poke bowl au saumon · 215 g/);
      assert.match(await eatenRing(page), /^3\d\d \//);
      assert.equal(await page.evaluate(() => sheets.length), 0);
    } },
    { name: 'un aliment Ciqual (pomme, 150 g) au goûter', fn: async ({ page }) => {
      await page.evaluate(() => journalAdd('gouter'));
      await page.click('[data-mode="aliment"]');
      await page.fill('[data-food-q]', 'pomme');
      await page.waitForSelector('[data-code]');
      await page.click('[data-code]');
      await page.waitForSelector('form[data-form="qty"]');
      await page.fill('[name="qty"]', '150');
      await page.click('form[data-form="qty"] button.primary');
      await page.waitForTimeout(1200);
      const e = await entries(page);
      assert.equal(e.length, 2);
      assert.match(e.join(' '), /Pomme.*150 g/);
    } },
    { name: 'récents → habituel (étoile) → ajout en un tap', fn: async ({ page }) => {
      await page.evaluate(() => journalAdd('petit-dejeuner'));
      await page.waitForSelector('[data-rec]');
      assert.equal(await page.$('[data-fav]'), null);
      await page.click('[data-star-rec]');
      await page.waitForSelector('[data-fav]');
      assert.equal(await page.evaluate(() => state.favoris.length), 1);
      await page.click('[data-fav]');
      await page.waitForTimeout(1200);
      assert.equal((await entries(page)).length, 3);
      assert.match(await H.toastText(page), /Ajouté/);
    } },
    { name: 'une recette du carnet (1 portion) au dîner', fn: async ({ page }) => {
      await page.evaluate(() => journalAdd('soir'));
      await page.click('[data-mode="recette"]');
      await page.waitForSelector('[data-rid]');
      await page.click('[data-rid]');
      await page.waitForSelector('form[data-form="qty"]');
      await page.fill('[name="qty"]', '1');
      await page.click('form[data-form="qty"] button.primary');
      await page.waitForTimeout(1200);
      assert.equal((await entries(page)).length, 4);
    } },
    { name: 'suppression d\'une entrée', fn: async ({ page }) => {
      await page.click('.timeline .tl-food [data-act="journal-del"]');
      await page.waitForTimeout(1000);
      assert.equal((await entries(page)).length, 3);
    } },
    { name: 'le compagnon réagit et gagne des coquillages', fn: async ({ page }) => {
      const c = await page.evaluate(() => companionOf(journalMember()).coquillages);
      assert.ok(c > 100, `coquillages = ${c}`);
      assert.equal(await page.evaluate(() => Pet.queue.length), 0, 'réactions jouées');
      assert.ok((await page.$eval('[data-bubble]', (e) => e.textContent)).length > 5);
    } },
    { name: 'Suivi : copier la veille et ajouter les habituels', fn: async ({ page }) => {
      await page.evaluate(async () => {
        const m = journalMember();
        const y = isoDate(addDays(new Date(), -1));
        await Data.addJournal({ date: y, member_id: m.id, slot: 'midi', label: 'Riz blanc, cuit', source: 'ciqual', ref: '9104', grams: 200, n: { kcal: 310, prot: 6, gluc: 68, suc: 0, lip: 1, ags: 0, fib: 2, sel: 0 } });
      });
      await H.openTab(page, 'suivi');
      const before = await page.evaluate(() => state.journal.filter((j) => j.date === isoDate(new Date()) && j.member_id === journalMember().id).length);
      await page.click('[data-act="journal-copy"]');
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => state.journal.filter((j) => j.date === isoDate(new Date()) && j.member_id === journalMember().id).length);
      assert.equal(after, before + 1);
      await page.evaluate(async () => { for (const j of state.journal.filter((x) => x.date === isoDate(new Date()) && x.slot === 'petit-dejeuner')) await Data.deleteJournal(j.id); render(); });
      await page.waitForSelector('[data-act="journal-habits"][data-slot="petit-dejeuner"]');
      await page.click('[data-act="journal-habits"][data-slot="petit-dejeuner"]');
      await page.waitForTimeout(1200);
      assert.match(await H.toastText(page), /habituel/);
      assert.ok(await page.evaluate(() => state.journal.some((x) => x.date === isoDate(new Date()) && x.slot === 'petit-dejeuner')));
    } },
  ],
};
