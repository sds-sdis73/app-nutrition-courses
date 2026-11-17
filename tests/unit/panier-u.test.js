const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

before(() => app.ready);

describe('panier Courses U : contenance et nombre de produits', () => {
  const m = (t, o) => { const r = app.PanierU.mesure(t, o); return r && `${+r.v.toFixed(3)} ${r.base}`; };
  test('formats lus dans les noms et adresses Courses U', () => {
    assert.equal(m('lait-demi-ecreme-uht-lait-dici-6x1l'), '6000 ml');
    assert.equal(m('Lait demi écrémé en poudre REGILAIT, 300g'), '300 g');
    assert.equal(m('Yaourts nature 4 x 125 g'), '500 g');
    assert.equal(m('Crème fraîche épaisse 20cl'), '200 ml');
    assert.equal(m('Farine T55 1,5 kg'), '1500 g');
    assert.equal(m('Œufs frais boîte de 12'), '12 pièce');
    assert.equal(m('lait-uht-s-b-vache-demi-ecreme'), null);
    assert.equal(m('3', { nu: true }), '3 pièce');
    assert.equal(m('2 c. à s.', { nu: true }), null);
  });
  test('contenance tirée du nom mémorisé, sinon de l\'adresse', () => {
    assert.equal(app.PanierU.contenance({ url: 'https://www.coursesu.com/p/lait-demi-ecreme-uht-le-gourmand-6x1l/5048962.html' }).v, 6000);
    assert.equal(app.PanierU.contenance({ url: 'https://www.coursesu.com/p/quinoa/1.html', label: 'Quinoa bio 500 g' }).v, 500);
    assert.equal(app.PanierU.pidUrl('https://www.coursesu.com/p/lait-demi-ecreme-uht-le-gourmand-6x1l/5048962.html'), '5048962');
  });
  test('besoin ÷ contenance, arrondi au-dessus avec 5 % de marge ; 1 si incomparable', () => {
    app.state.links.farine = { url: 'https://www.coursesu.com/p/farine-de-ble-t45-u-1kg/111.html' };
    app.state.links.oeufs = { url: 'https://www.coursesu.com/p/oeufs-frais-boite-de-6/222.html' };
    app.state.links.huile = { url: 'https://www.coursesu.com/p/huile-olive-1l/333.html' };
    const n = (a) => app.PanierU.auto(a).n;
    assert.equal(n({ cle: 'farine', besoin: '1,8 kg' }), 2);
    assert.equal(n({ cle: 'farine', besoin: { v: 1030, base: 'g' } }), 1); // 3 % de trop : un paquet suffit
    assert.equal(n({ cle: 'farine', besoin: '250 g' }), 1);
    assert.equal(n({ cle: 'oeufs', besoin: '8' }), 2);
    assert.equal(n({ cle: 'huile', besoin: '3 c. à s.' }), 1);
    assert.equal(n({ cle: 'huile', besoin: '500 g' }), 1); // g contre ml : pas de calcul
    assert.equal(app.PanierU.code([{ cle: 'farine', pid: '111', besoin: '1,8 kg' }, { cle: 'oeufs', pid: '222', besoin: '8' }]), '111*2,222*2');
    for (const k of ['farine', 'oeufs', 'huile']) delete app.state.links[k];
  });
});
