const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

before(() => app.ready);

const parse = (t) => JSON.parse(JSON.stringify(app.parseMeal(t))); // objets du bac à sable → objets ordinaires
const kinds = (t) => parse(t).map((l) => (l.food ? `${l.kind}:${l.food.nom}:${l.grams}` : `${l.kind}:${l.ml ?? l.name}`));

describe('saisie en texte libre (analyse locale)', () => {
  test('« 2 œufs, une tartine beurrée et un café » → œufs 110 g, pain 40 g, beurre 8 g, café 150 g', () => {
    const r = parse('2 œufs, une tartine beurrée et un café');
    assert.equal(r.length, 4);
    assert.deepEqual(r.map((l) => [l.food.nom.split(',')[0], l.grams]), [['Oeuf dur', 110], ['Pain blanc (par ex. : baguette', 40], ['Beurre à 80% MG minimum', 8], ['Café', 150]]);
  });
  test('quantités en grammes, mots-nombres et demi', () => {
    assert.equal(parse('200 g de riz')[0].grams, 200);
    assert.equal(parse('trois pommes')[0].grams, 450);
    assert.equal(parse('une demi baguette')[0].grams, 50);
    assert.equal(parse('1,5 kg de pommes de terre')[0].grams, 1500);
  });
  test('unités ménagères dépendant de l\'aliment : bol de céréales 40 g, tranche de jambon 40 g', () => {
    const r = parse('un bol de céréales avec du lait');
    assert.match(r[0].food.nom, /^Céréales pour petit déjeuner/);
    assert.equal(r[0].grams, 40);
    assert.match(r[1].food.nom, /^Lait demi-écrémé/);
    assert.equal(parse('deux tranches de jambon')[0].grams, 80);
  });
  test('plats reconnus : lasagnes (part = portion), kebab, poke bowl', () => {
    assert.deepEqual(kinds('une part de lasagnes'), ['plat:Lasagnes ou canellonis à la viande (bolognaise):300']);
    assert.match(kinds('un kebab')[0], /^plat:Sandwich grec ou kebab/);
    assert.match(kinds('poke bowl au saumon')[0], /^plat:Poke bowl au saumon:430/);
  });
  test('l\'eau va dans l\'hydratation', () => {
    assert.deepEqual(kinds("un verre d'eau"), ['eau:200']);
    assert.deepEqual(kinds('50 cl d\'eau'), ['eau:500']);
  });
  test('mot inconnu : ligne « non reconnu » au lieu d\'un faux résultat', () => {
    assert.deepEqual(kinds('un truc bizarre'), ['inconnu:truc bizarre']);
  });
  test('séparateurs : virgule, et, avec, +, retour à la ligne', () => {
    assert.equal(parse('pomme + yaourt\nun café avec du sucre et deux biscuits').length, 5);
  });
});

describe('suivi du poids', () => {
  const series = (start, kgs, step = 3) => kgs.map((kg, i) => ({ date: app.isoDate(app.addDays(app.isoToDate(start), i * step)), poids_kg: kg }));
  test('tendance lissée et pente en kg/semaine (régression sur 28 jours)', () => {
    const t = app.weightTrend(series('2026-09-21', [80, 79.8, 79.5, 79.4, 79.1, 78.9, 78.6, 78.4, 78.1, 78]));
    assert.equal(t.last, 78);
    assert.ok(t.slopeWeek < -0.4 && t.slopeWeek > -0.7, `${t.slopeWeek}`);
    assert.ok(t.trend > 78 && t.trend < 79.5);
  });
  test('pas de pente avant 2 semaines et 4 pesées', () => {
    assert.equal(app.weightTrend(series('2026-10-10', [80, 79.5, 79.2], 3)).slopeWeek, null);
    assert.equal(app.weightTrend([]), null);
  });
  test('conseil : perte de poids qui stagne → −100 kcal ; perte trop rapide → +100 ; maintien stable → aucun', () => {
    const m = { ...app.profiles.homme, objectif: 'perte' };
    const flat = series('2026-09-21', [80, 80.1, 79.9, 80, 80.2, 80, 80.1, 80]);
    const a = app.weightAdvice(m, flat);
    assert.equal(a.delta, -100);
    assert.equal(a.kcal, Math.round((app.kcalNeed(m) - 100) / 10) * 10);
    const fast = series('2026-09-21', [80, 79.4, 78.8, 78.2, 77.6, 77, 76.4, 75.8]);
    assert.equal(app.weightAdvice(m, fast).delta, 100);
    assert.equal(app.weightAdvice({ ...m, objectif: 'maintien' }, flat), null);
  });
});
