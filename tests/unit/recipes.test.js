const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

before(() => app.ready);

describe('ingrédients', () => {
  test('« 200 g de farine » → 200 g, nom sans « de »', () => {
    const i = app.parseIngredientLine('200 g de farine');
    assert.equal(i.qty, '200'); assert.equal(i.unit, 'g'); assert.equal(i.name, 'Farine');
    assert.equal(app.ingGrams(i), 200);
  });
  test('« 2 œufs » → 2 pièces, ≈ 50 g chacun', () => {
    const i = app.parseIngredientLine('2 œufs');
    assert.equal(i.qty, '2'); assert.equal(i.unit, 'pièce'); assert.equal(i.name, 'Œufs');
    const g = app.ingGrams(i);
    assert.ok(g >= 90 && g <= 130, `${g} g`);
  });
  test('« 1 c. à s. d\'huile d\'olive » → cuillère à soupe', () => {
    const i = app.parseIngredientLine("1 c. à s. d'huile d'olive");
    assert.equal(i.qty, '1'); assert.equal(i.name, "Huile d'olive");
    assert.ok(/soupe|c\. à s\.|cas/i.test(i.unit), i.unit);
    assert.ok(app.ingGrams(i) > 5 && app.ingGrams(i) < 20);
  });
  test('« 400 ml de lait de coco », « 1,5 kg de pommes de terre », « sel »', () => {
    const l = app.parseIngredientLine('400 ml de lait de coco');
    assert.equal(l.qty, '400'); assert.equal(l.unit, 'ml');
    const p = app.parseIngredientLine('1,5 kg de pommes de terre');
    assert.equal(Number(p.qty), 1.5); assert.equal(p.unit, 'kg'); assert.equal(app.ingGrams(p), 1500);
    const s = app.parseIngredientLine('sel');
    assert.equal(s.qty, ''); assert.equal(s.name, 'Sel');
  });
  test('rayons devinés', () => {
    assert.equal(app.guessAisle('Carottes'), app.guessAisle('Courgettes'));
    assert.notEqual(app.guessAisle('Carottes'), app.guessAisle('Steak haché'));
    assert.notEqual(app.guessAisle('Lait demi-écrémé'), app.guessAisle('Farine'));
  });
  test('action détectée dans une étape', () => {
    assert.equal(app.detectAction('Éplucher et émincer les oignons'), 'prep');
    assert.equal(app.detectAction('Enfourner 40 min à 180 °C'), 'four');
  });
});

describe('nutrition des recettes', () => {
  const recipe = () => ({ ...app.blankRecipe(), title: 'Test', servings: 4, ingredients: ['250 g de riz basmati', '400 g de pois chiches', '400 ml de lait de coco', '2 oignons'].map(app.parseIngredientLine) });
  test('toutes les lignes trouvent un aliment Ciqual et le total est plausible', () => {
    const n = app.recipeNutrition(recipe());
    assert.equal(n.missing, 0, n.lines.filter((l) => !l.n).map((l) => l.name).join(', '));
    assert.ok(n.total.kcal > 1200 && n.total.kcal < 2600, `${n.total.kcal} kcal`);
    assert.ok(n.perPortion.kcal > 300 && n.perPortion.kcal < 700);
  });
  test('Nutri-Score d\'une recette : lettre A à E', () => {
    const ns = app.recipeNutriScore(recipe());
    assert.ok(ns && /^[A-E]$/.test(ns.grade), JSON.stringify(ns));
  });
  test('portion standard : par portion × (servings / portion standard pour 2 000 kcal)', () => {
    const r = recipe();
    app.state.recipes = [r];
    const p = app.portionN(r);
    assert.ok(p.kcal > 0);
    app.state.recipes = [];
  });
});

describe('Nutri-Score et score produit (Yuka-like)', () => {
  test('eau → A, biscuit chocolaté → D/E, pain complet → A/B', () => {
    const eau = { kcal: 0, prot: 0, gluc: 0, suc: 0, lip: 0, ags: 0, fib: 0, sel: 0 };
    const biscuit = { kcal: 500, prot: 6, gluc: 62, suc: 32, lip: 24, ags: 14, fib: 2, sel: 0.6 };
    const pain = { kcal: 240, prot: 9, gluc: 44, suc: 2, lip: 2, ags: 0.4, fib: 7, sel: 1.1 };
    assert.equal(app.nutriScore(eau).grade, 'A');
    assert.ok(/[DE]/.test(app.nutriScore(biscuit).grade), app.nutriScore(biscuit).grade);
    assert.ok(/[AB]/.test(app.nutriScore(pain).grade), app.nutriScore(pain).grade);
  });
  test('score produit : A bio sans additif > E avec additifs à risque ; sans grade → null', () => {
    const good = app.computeScore({ nutriscore_grade: 'a', additives_tags: [], labels_tags: ['en:organic'] });
    const bad = app.computeScore({ nutriscore_grade: 'e', additives_tags: ['en:e102', 'en:e124'], labels_tags: [] });
    assert.ok(good.total > 75 && bad.total < 30, `${good.total} / ${bad.total}`);
    assert.equal(app.computeScore({}).total, null);
    assert.ok(app.scoreLevel(good.total));
  });
  test('valeurs pour 100 g depuis Open Food Facts, calcium en mg', () => {
    const n = app.offPer100({ nutriments: { 'energy-kcal_100g': 250, proteins_100g: 8, carbohydrates_100g: 30, sugars_100g: 4, fat_100g: 10, 'saturated-fat_100g': 4, fiber_100g: 3, salt_100g: 1.2, calcium_100g: 0.12 } });
    assert.equal(n.kcal, 250); assert.equal(n.sel, 1.2); assert.equal(n.ca, 120);
  });
});

describe('courses et batch (état simulé)', () => {
  test('liste de courses générée depuis le planning, sans les basiques, article libre inclus', () => {
    const r = { ...app.blankRecipe(), id: 'r1', title: 'Curry', servings: 4, ingredients: ['400 g de pois chiches', '2 oignons', 'sel'].map(app.parseIngredientLine) };
    app.state.recipes = [r];
    app.state.members = [app.profiles.homme, app.profiles.femme];
    app.state.placards = [{ id: 'p1', type: 'basique', ing_key: 'sel', name: 'Sel' }];
    app.state.plan = [{ id: 'pl1', week: app.isoDate(app.state.week), day: 2, slot: 'soir', recipe_id: 'r1', servings: 2, eaters: null, guests: 0, reste_id: null }];
    app.state.extras = [{ id: 'x1', name: 'Lessive', qty: '1', aisle: 'Entretien', checked: false }];
    app.state.checks = {};
    const sh = app.buildShopping();
    const names = [...sh.byAisle.values()].flat().map((i) => i.name);
    assert.ok(names.some((n) => /pois chiches/i.test(n)));
    assert.ok(names.some((n) => /lessive/i.test(n)));
    assert.ok(!names.some((n) => /^sel$/i.test(n)), 'le sel est un basique');
    assert.ok(sh.skippedBasics.some((b) => /sel/i.test(b.name)));
    app.state.recipes = []; app.state.plan = []; app.state.extras = []; app.state.placards = []; app.state.members = [];
  });
});
