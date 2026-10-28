const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

before(() => app.ready);

describe('recherche Ciqual', () => {
  test('« pain » donne le pain blanc en premier, pas un panini', () => {
    const r = app.CQ.search('pain', 5);
    assert.ok(r.length);
    assert.match(r[0].nom, /^Pain blanc/);
  });
  test('« poulet » : un aliment simple avant les plats composés', () => {
    const r = app.CQ.search('poulet', 5);
    assert.ok(r.length);
    assert.doesNotMatch(r[0].groupe, /plats composés|sandwichs|pizzas/);
  });
  test('« lait » : lait demi-écrémé privilégié ; « farine » : T55', () => {
    assert.match(app.CQ.search('lait', 1)[0].nom, /^Lait demi-écrémé/);
    assert.match(app.CQ.search('farine', 1)[0].nom, /T55/);
  });
  test('mots vides ou trop courts : aucun résultat ; accents ignorés', () => {
    assert.equal(app.CQ.search('de la').length, 0);
    assert.equal(app.CQ.search('épinard', 3).length, 3);
    assert.equal(app.CQ.search('epinard', 1)[0].nom, app.CQ.search('épinard', 1)[0].nom);
  });
  test('matchScore : mot exact > préfixe, mot manquant pénalisé', () => {
    const a = { words: ['tomate', 'crue'], key: 'tomate crue', groupe: 'légumes', noKcal: false };
    const exact = app.matchScore(['tomate'], a);
    const prefix = app.matchScore(['toma'], a);
    const missing = app.matchScore(['tomate', 'farcie'], a);
    assert.ok(exact > prefix && exact > missing);
    assert.equal(app.matchScore(['banane'], a), 0);
  });
});

describe('recherche de plats', () => {
  test('« poke » : les deux poke bowls en tête', () => {
    const r = app.PL.search('poke', null, 5).map((x) => x.nom);
    assert.ok(r.slice(0, 2).every((n) => /^Poke bowl/.test(n)), r.join(' | '));
  });
  test('« lasagnes » trouve des lasagnes avec une portion de 300 g', () => {
    const r = app.PL.search('lasagnes', null, 5);
    assert.ok(r.length && /lasagne/i.test(r[0].nom));
    assert.equal(r[0].portion, 300);
  });
  test('sans mot : la catégorie demandée, plats composés maison d\'abord puis ordre alphabétique', () => {
    const r = app.PL.search('', 'Petit-déjeuner', 100);
    assert.ok(r.length >= 15);
    assert.ok(r.every((x) => x.cat === 'Petit-déjeuner'));
    const r2 = app.PL.search('', 'Plats', 200);
    const firstCiqual = r2.findIndex((x) => x.src === 'ciqual');
    assert.ok(r2.slice(0, firstCiqual).every((x) => x.src === 'compose'));
  });
  test('toutes les catégories de l\'interface existent dans la base', () => {
    const cats = new Set(app.PL.list.map((x) => x.cat));
    for (const c of app.PLAT_CATS) assert.ok(cats.has(c), c);
  });
});
