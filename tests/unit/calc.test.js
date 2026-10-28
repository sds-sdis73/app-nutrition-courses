const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

describe('besoins énergétiques', () => {
  test('homme 80 kg modérément actif : besoin plausible et macros cohérentes', () => {
    const nd = app.needs(app.profiles.homme);
    assert.ok(nd.kcal > 2400 && nd.kcal < 3200, `kcal = ${nd.kcal}`);
    const macroKcal = nd.prot * 4 + nd.gluc * 4 + nd.lip * 9;
    assert.ok(Math.abs(macroKcal - nd.kcal) / nd.kcal < 0.05, 'protéines + glucides + lipides ≈ kcal');
    assert.equal(nd.sel, 5);
  });
  test('femme peu active < homme, enfant de 8 ans entre 1 300 et 2 000 kcal, ado actif > femme', () => {
    const h = app.kcalNeed(app.profiles.homme), f = app.kcalNeed(app.profiles.femme), e = app.kcalNeed(app.profiles.enfant), a = app.kcalNeed(app.profiles.ado);
    assert.ok(f < h);
    assert.ok(e > 1300 && e < 2000, `enfant = ${e}`);
    assert.ok(a > f);
    assert.equal(app.needs(app.profiles.enfant).sel, 4);
  });
  test('objectif perte : −15 %, prise : +10 %', () => {
    const base = app.kcalNeed(app.profiles.homme);
    assert.equal(app.kcalNeed({ ...app.profiles.homme, objectif: 'perte' }), Math.round((base * 0.85) / 10) * 10);
    assert.equal(app.kcalNeed({ ...app.profiles.homme, objectif: 'prise' }), Math.round((base * 1.1) / 10) * 10);
  });
  test('besoin personnalisé prioritaire', () => {
    assert.equal(app.kcalNeed({ ...app.profiles.homme, kcal_perso: 1800 }), 1800);
  });
  test('date de naissance absente ou invalide : 30 ans par défaut, jamais NaN', () => {
    assert.equal(app.ageOf({ naissance: '' }), 30);
    assert.equal(app.ageOf({ naissance: 'n/a' }), 30);
    assert.equal(app.ageOf({}), 30);
    assert.ok(Number.isFinite(app.kcalNeed({ ...app.profiles.homme, naissance: '' })));
  });
  test('métabolisme de base Mifflin-St Jeor', () => {
    const m = app.profiles.homme;
    const age = app.ageOf(m);
    const expected = 10 * 80 + 6.25 * 180 - 5 * age + 5;
    assert.ok(Math.abs(app.bmrOf(m) - expected) < 1, `${app.bmrOf(m)} ≠ ${expected}`);
  });
});

describe('dépense et hydratation', () => {
  const m = app.profiles.homme;
  const iso = app.isoDate(app.today);
  test('seules les activités faites comptent', () => {
    app.state.activites = [
      { member_id: 'm1', date: iso, kind: 'seance', statut: 'fait', kcal: 300, minutes: 45 },
      { member_id: 'm1', date: iso, kind: 'seance', statut: 'prevu', kcal: 500, minutes: 60 },
      { member_id: 'm2', date: iso, kind: 'seance', statut: 'fait', kcal: 200, minutes: 30 },
    ];
    const e = app.expense(m, app.today);
    assert.equal(e.active, 300);
    assert.equal(e.minutes, 45);
    assert.equal(e.seances.length, 1);
    assert.equal(e.total, Math.round(app.bmrOf(m) * 1.2 + 300));
  });
  test("objectif d'eau : repère EFSA + 500 ml par heure d'activité, arrondi à 50 ml", () => {
    app.state.activites = [];
    assert.equal(app.waterGoal(m, app.today), 2000);
    assert.equal(app.waterGoal(app.profiles.femme, app.today), 1600);
    assert.equal(app.waterGoal(app.profiles.enfant, app.today), 1300);
    app.state.activites = [{ member_id: 'm1', date: iso, kind: 'seance', statut: 'fait', kcal: 300, minutes: 60 }];
    assert.equal(app.waterGoal(m, app.today), 2500);
    assert.equal(app.waterGoal({ ...m, objectif_eau_ml: 1750 }, app.today), 1750);
    app.state.activites = [];
  });
  test('total bu et format en litres', () => {
    app.state.eau = [{ member_id: 'm1', date: iso, heure: '08:00', ml: 250 }, { member_id: 'm1', date: iso, heure: '10:00', ml: 500 }, { member_id: 'm2', date: iso, heure: '10:00', ml: 500 }];
    assert.equal(app.waterTotal(m, app.today), 750);
    assert.equal(app.fmtL(750), '750 ml');
    assert.equal(app.fmtL(1500), '1,5 L');
    app.state.eau = [];
  });
});

describe('critères du jour et coquillages', () => {
  const m = app.profiles.homme;
  const iso = app.isoDate(app.today);
  const entry = (kcal, prot, fib, suc, sel, slot = 'midi') => ({ id: `j${Math.random()}`, member_id: 'm1', date: iso, slot, label: 'x', source: 'ciqual', n: { kcal, prot, gluc: 0, suc, lip: 0, ags: 0, fib, sel, ca: 0, fe: 0, vitc: 0 } });
  test('journée vide', () => {
    app.state.journal = []; app.state.eau = []; app.state.activites = []; app.state.plan = [];
    const cr = app.dayCriteria(m, app.today);
    assert.equal(cr.empty, true);
    assert.equal(cr.score, 0);
    assert.equal(cr.shells, 0);
  });
  test('journée dans la cible (90–105 %) et équilibrée : bonus', () => {
    const nd = app.needs(m);
    const k = nd.kcal * 0.97;
    app.state.journal = [entry(k / 3, nd.prot / 3, nd.fib / 3, 5, 1, 'petit-dejeuner'), entry(k / 3, nd.prot / 3, nd.fib / 3, 5, 1, 'midi'), entry(k / 3, nd.prot / 3, nd.fib / 3, 5, 1, 'soir')];
    app.state.eau = [{ member_id: 'm1', date: iso, heure: '10:00', ml: 2000 }];
    const cr = app.dayCriteria(m, app.today);
    assert.equal(cr.cible, true);
    assert.ok(cr.score >= 5, `score = ${cr.score}`);
    assert.equal(cr.shells, cr.score * 2 + 5);
    assert.equal(cr.items.find((i) => i.key === 'eau').ok, true);
    assert.equal(cr.items.find((i) => i.key === 'bouge').na, true, "pas d'activité : critère non compté");
  });
  test('journée au-dessus de la cible : pas de bonus, « over »', () => {
    const nd = app.needs(m);
    app.state.journal = [entry(nd.kcal * 1.3, 50, 10, 80, 8)];
    app.state.eau = [];
    const cr = app.dayCriteria(m, app.today);
    assert.equal(cr.cible, false);
    assert.equal(cr.items[0].over, true);
    assert.equal(cr.shells, cr.score * 2);
    app.state.journal = [];
  });
});

describe('fil de la journée (horaires internes)', () => {
  test('plusMin et lateAfter', () => {
    assert.equal(app.plusMin('12:30', 150), '15:00');
    assert.equal(app.plusMin('23:00', 120), '23:59');
    assert.equal(app.lateAfter('petit-dejeuner', '07:30'), '11:00');
    assert.equal(app.lateAfter('midi', '12:30'), '15:00');
    assert.equal(app.lateAfter('soir', '19:30'), '22:00');
  });
  test('période de la journée', () => {
    assert.equal(app.periodOf(3), 'nuit');
    assert.equal(app.periodOf(8), 'matin');
    assert.equal(app.periodOf(13), 'jour');
    assert.equal(app.periodOf(19), 'soir');
    assert.equal(app.periodOf(22), 'nuit');
  });
  test('repères d\'eau croissants jusqu\'à 100 %', () => {
    const fr = app.WATER_POINTS.map((p) => p[1]);
    assert.equal(JSON.stringify([...fr].sort((a, b) => a - b)), JSON.stringify(fr));
    assert.equal(fr[fr.length - 1], 1);
  });
});

describe('activités (MET)', () => {
  test('CrossFit présent dans Cardio & fitness, ~70 activités, MET entre 2 et 12', () => {
    assert.ok(app.MET_CATS['Cardio & fitness'].some(([l]) => l === 'CrossFit'));
    assert.ok(app.MET.length >= 60, `${app.MET.length} activités`);
    for (const [label, met, cat] of app.MET) { assert.ok(met >= 2 && met <= 12, `${label} : MET ${met}`); assert.ok(app.MET_CATS[cat]); }
    assert.equal(new Set(app.MET.map((x) => x[0])).size, app.MET.length, 'libellés uniques');
  });
  test('45 min de CrossFit pour 80 kg ≈ 480 kcal', () => {
    const met = app.MET.find((x) => x[0] === 'CrossFit')[1];
    assert.equal(Math.round(met * 80 * 45 / 60), 480);
  });
});
