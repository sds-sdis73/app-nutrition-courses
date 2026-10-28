const assert = require('node:assert/strict');
const H = require('../helpers');

const TABS = ['aujourdhui', 'scan', 'recettes', 'planning', 'courses', 'batch', 'suivi'];
const SHEETS = [
  ['Noter un repas', () => journalAdd('midi')],
  ['Quantité', () => quantitySheet({ slot: 'midi', label: 'Poke bowl au saumon', per100: { kcal: 144, prot: 6.5, gluc: 13.5, suc: 2, lip: 6.7, ags: 1, fib: 1.3, sel: 0.5 }, source: 'ciqual', ref: 'plat:m1', defaultGrams: 430, portionG: 430 })],
  ['Activité', () => activiteSheet()],
  ['Hydratation', () => eauSheet()],
  ['Boutique', () => boutiqueSheet(journalMember(), 'accessoires')],
  ['Paramètres', () => openSettings()],
  ['Foyer', () => openFoyer()],
];

async function check(page, label) {
  assert.ok(await H.noHorizontalScroll(page), `${label} : défilement horizontal`);
  const wide = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    // Les éléments rognés par un conteneur (scène du compagnon, rangées de puces défilantes) ne débordent pas réellement.
    const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip') return true; } return false; };
    return [...document.querySelectorAll('#main *, .sheet-wrap.open *')].filter((el) => { if (el.ownerSVGElement || clipped(el)) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.right > W + 2; }).slice(0, 3).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`);
  });
  assert.deepEqual(wide, [], `${label} : éléments hors écran : ${wide.join(', ')}`);
}

const build = (name, viewport) => ({
  name,
  viewport,
  before: async ({ page }) => {
    await page.evaluate(async () => {
      const m = journalMember();
      const d = isoDate(new Date());
      await Data.addJournal({ date: d, member_id: m.id, slot: 'petit-dejeuner', label: 'Pain blanc (par ex. : baguette, boule…)', source: 'ciqual', ref: '7001', grams: 100, n: { kcal: 287, prot: 9, gluc: 57, suc: 2, lip: 1, ags: 0, fib: 3, sel: 1.3 } });
      await Data.setMeal(2, 'midi', state.recipes[0].id, 3);
      render();
    });
  },
  tests: [
    ...TABS.map((t) => ({ name: `onglet ${t}`, fn: async ({ page }) => { await H.openTab(page, t); await check(page, t); } })),
    ...SHEETS.map(([label, open]) => ({ name: `feuille ${label}`, fn: async ({ page }) => {
      await H.openTab(page, 'aujourdhui');
      await page.evaluate(open);
      await page.waitForSelector('.sheet-wrap.open');
      await page.waitForTimeout(500);
      await check(page, label);
      await H.closeSheets(page);
    } })),
    { name: 'barre d\'onglets : 7 boutons sur une ligne', fn: async ({ page }) => {
      const rects = await page.$$eval('.tabbar button', (l) => l.map((b) => b.getBoundingClientRect().top));
      assert.equal(rects.length, 7);
      assert.ok(Math.max(...rects) - Math.min(...rects) < 2, 'tous sur la même ligne');
    } },
  ],
});

module.exports = build('Mise en page (iPhone 13, 390 px)');
module.exports.build = build;
