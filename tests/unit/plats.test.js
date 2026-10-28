const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'plats.json'), 'utf8'));
const idx = Object.fromEntries(d.fields.map((f, i) => [f, i]));
const plats = d.plats.map((a) => Object.fromEntries(d.fields.map((f, i) => [f, a[i]])));
const CATS = ['Petit-déjeuner', 'Plats', 'Sandwichs & burgers', 'Pizzas, tartes & crêpes', 'Salades', 'Soupes', 'Entrées & apéro', 'Goûter', 'Viennoiseries', 'Desserts & pâtisseries'];

describe('base de plats (plats.json)', () => {
  test('au moins 500 plats, identifiants et noms uniques', () => {
    assert.ok(plats.length >= 500, `${plats.length}`);
    assert.equal(new Set(plats.map((p) => p.id)).size, plats.length);
    assert.equal(new Set(plats.map((p) => p.nom.toLowerCase())).size, plats.length);
  });
  test('chaque plat : kcal > 0, portion entre 20 g et 1 600 g, catégorie connue, source ciqual ou compose', () => {
    for (const p of plats) {
      assert.ok(p.kcal > 0, p.nom);
      assert.ok(p.portion >= 20 && p.portion <= 1600, `${p.nom} : ${p.portion} g`);
      assert.ok(CATS.includes(p.cat), `${p.nom} : ${p.cat}`);
      assert.ok(['ciqual', 'compose'].includes(p.src), p.nom);
      const kp = (p.kcal * p.portion) / 100;
      assert.ok(kp >= 10 && kp <= 1600, `${p.nom} : ${Math.round(kp)} kcal par portion`);
    }
  });
  test('plats composés : macros cohérentes avec les kcal (±20 %)', () => {
    const comp = plats.filter((p) => p.src === 'compose');
    assert.ok(comp.length >= 60, `${comp.length} plats composés`);
    for (const p of comp) {
      const est = 4 * p.prot + 4 * p.gluc + 9 * p.lip + 2 * (p.fib || 0);
      assert.ok(Math.abs(est - p.kcal) / p.kcal <= 0.2, `${p.nom} : ${p.kcal} kcal vs ${Math.round(est)} estimées`);
    }
  });
  test('noms nettoyés : plus de « préemballé » ni « à réchauffer »', () => {
    for (const p of plats) assert.doesNotMatch(p.nom, /préemballé|à réchauffer|\(aliment moyen\)/, p.nom);
  });
  test('quelques plats attendus', () => {
    for (const n of ['Poke bowl au saumon', 'Bo bun au bœuf', 'Steak frites', 'Tartines beurre confiture']) assert.ok(plats.some((p) => p.nom === n), n);
    assert.ok(plats.some((p) => /lasagne/i.test(p.nom)));
    assert.ok(plats.some((p) => /croque-monsieur/i.test(p.nom)));
  });
});
