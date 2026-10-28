const assert = require('node:assert/strict');
const H = require('../helpers');

const HOUR = /\b\d{1,2}\s?[:h]\s?\d{2}\b/;

module.exports = {
  name: 'Accueil : fil de la journée (12 h 05)',
  tests: [
    { name: 'héros : compagnon, trois anneaux, boutons rapides, famille', fn: async ({ page }) => {
      assert.ok(await page.$('[data-scene] .comp'), 'compagnon dans la scène');
      assert.equal(await page.$$eval('.ring', (l) => l.length), 3);
      assert.deepEqual(await page.$$eval('.ring span', (l) => l.map((x) => x.textContent)), ['mangé', 'activité', 'eau']);
      assert.equal(await page.$$eval('.quick3 .btn', (l) => l.length), 3);
      assert.equal(await page.$$eval('.famille .fam', (l) => l.length), 3);
      assert.match(await page.$eval('[data-shells]', (e) => e.textContent), /100/);
    } },
    { name: 'aucune heure affichée, repère « Maintenant » présent, ordre des repas', fn: async ({ page }) => {
      const txt = await page.$eval('.timeline', (e) => e.innerText);
      assert.doesNotMatch(txt, HOUR, 'pas d\'heure dans le fil');
      assert.match(txt, /MAINTENANT|Maintenant/);
      const titles = await page.$$eval('.timeline .tl-item.repas > .tl-card > .row > b', (l) => l.map((x) => x.textContent.trim()));
      assert.deepEqual(titles, ['Petit-déjeuner', 'Déjeuner', 'Goûter', 'Dîner']);
    } },
    { name: 'petit-déjeuner passé sans saisie : « Rien de noté » après 11 h ; déjeuner : Noter / Une idée ? / Planifier', fn: async ({ page }) => {
      const cards = await page.$$eval('.timeline .tl-item.repas', (l) => l.map((x) => ({ cls: x.className, txt: x.innerText, btns: [...x.querySelectorAll('.tl-actions button')].map((b) => b.textContent.trim()) })));
      assert.match(cards[0].cls, /missed/);
      assert.match(cards[0].txt, /Rien de noté/);
      assert.deepEqual(cards[1].btns, ['Noter', 'Une idée ?', 'Planifier']);
      assert.match(cards[1].cls, /next/);
      assert.match(cards[2].txt, /À venir/);
      assert.match(cards[3].txt, /Salade de quinoa/);
      assert.deepEqual(cards[3].btns.filter((b) => /Ajouter/.test(b)), ['Ajouter']);
    } },
    { name: 'repères d\'eau nommés par moment, rappel du bilan en fin de fil', fn: async ({ page }) => {
      const eau = await page.$$eval('.timeline .tl-item.eau b', (l) => l.map((x) => x.textContent.trim()));
      assert.deepEqual(eau, ['Hydratation · Matinée', 'Hydratation · Midi', 'Hydratation · Après-midi', 'Hydratation · Soirée', 'Hydratation · Avant de dormir']);
      const last = await page.$eval('.timeline > li:last-child', (e) => e.textContent);
      assert.match(last, /Bilan de la journée/);
    } },
    { name: 'changer de membre change le fil', fn: async ({ page }) => {
      await page.click('.famille .fam:nth-child(2)');
      await page.waitForTimeout(400);
      assert.match(await page.$eval('.tl-head', (e) => e.textContent), /Julie/);
      assert.equal(await page.evaluate(() => journalMember().nom), 'Julie');
      assert.ok(await page.$('[data-act="adopt"]'), 'Julie n\'a pas de compagnon : proposition d\'adoption');
      await page.click('.famille .fam:nth-child(1)');
      await page.waitForTimeout(300);
      assert.match(await page.$eval('.tl-head', (e) => e.textContent), /Antoine/);
    } },
    { name: 'pas de défilement horizontal', fn: async ({ page }) => { assert.ok(await H.noHorizontalScroll(page)); } },
  ],
};
