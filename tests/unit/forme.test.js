const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

before(() => app.ready);
const J = (x) => JSON.parse(JSON.stringify(x)); // objets du bac à sable → objets ordinaires
const exo = (id) => J(app.formeExo(id));
const MAISON = ['halteres', 'kettlebell', 'step', 'velo', 'ski-erg', 'rameur', 'barre-traction'];
const ANTOINE = { niveau: 'reprise', objectif_forme: 'forme', terrain: 'montagne', depart: { course: 1, renfo: 1, longue_km: 10 }, genes: { zones: {} } };

describe('générateur de renfo', () => {
  test('bibliothèque : ≥ 100 exercices, ids uniques, variantes et pictos existants', () => {
    const L = app.FORME_EXOS;
    assert.ok(L.length >= 100, `${L.length}`);
    assert.equal(new Set(L.map((e) => e.id)).size, L.length);
    for (const e of L) {
      for (const v of Object.values(e.variantes || {})) if (v) assert.ok(exo(v), `${e.id} → ${v}`);
      assert.ok(app.FORME_PICTOS[e.picto], `picto ${e.picto} de ${e.id}`);
    }
  });
  for (const format of ['circuit', 'coureur', 'force', 'amrap', 'emom', 'tabata', 'mobilite']) {
    for (const duree of [20, 30, 45]) {
      test(`${format} ${duree} min : durée respectée (±20 %), matériel du lieu uniquement`, () => {
        for (const seed of [1, 2, 3]) {
          const s = J(app.genSeance({ duree, format, materiel: [], intensite: 'moyen' }, seed));
          const sec = app.formeSeanceSecondes(s);
          assert.ok(Math.abs(sec - duree * 60) <= duree * 60 * 0.2, `${format} ${duree} min graine ${seed} : ${Math.round(sec / 60)} min`);
          for (const b of s.blocs) for (const it of b.items || []) assert.deepEqual(exo(it.exo).materiel, [], `${it.exo} demande du matériel`);
        }
      });
    }
  }
  test('graine stable : même graine, même séance ; autre graine, autre tirage', () => {
    const p = { duree: 30, format: 'circuit', materiel: MAISON };
    assert.deepEqual(J(app.genSeance(p, 42)), J(app.genSeance(p, 42)));
    assert.notDeepEqual(J(app.genSeance(p, 42)), J(app.genSeance(p, 43)));
  });
  test('tirage équilibré : un circuit contient jambes, pousser ou tirer, et tronc', () => {
    const s = J(app.genSeance({ duree: 30, format: 'circuit', materiel: MAISON }, 7));
    const pats = s.blocs.find((b) => b.kind === 'tours').items.map((i) => exo(i.exo).pattern);
    assert.ok(pats.includes('genou') && pats.includes('tronc') && (pats.includes('pousser') || pats.includes('tirer')), pats.join(','));
  });
  test('exclusions et gênes respectées', () => {
    const all = J(app.genSeance({ duree: 40, format: 'circuit', materiel: MAISON }, 3)).blocs.flatMap((b) => (b.items || []).map((i) => i.exo));
    const s = J(app.genSeance({ duree: 40, format: 'circuit', materiel: MAISON, exclus: all }, 3));
    for (const b of s.blocs) for (const it of b.items || []) assert.ok(!all.includes(it.exo), `${it.exo} exclu`);
    const pool = J(app.formePool({ materiel: MAISON, genes: ['genou'] }));
    assert.ok(!pool.some((e) => /saut|jump|burpee/i.test(e.id)), 'pas de sauts avec une gêne au genou');
  });
  test('remplacer un exercice garde le motif ; progression : +2 reps puis charge', () => {
    const p = { duree: 30, format: 'circuit', materiel: MAISON };
    const s = J(app.genSeance(p, 11));
    const bi = s.blocs.findIndex((b) => b.kind === 'tours');
    const old = s.blocs[bi].items[0].exo;
    const s2 = J(app.formeSwap(s, bi, 0, p, 5));
    assert.notEqual(s2.blocs[bi].items[0].exo, old);
    assert.equal(exo(s2.blocs[bi].items[0].exo).pattern, exo(old).pattern);
    const e = { base: 10, materiel: ['halteres'] };
    assert.deepEqual(J(app.formeProgression(e, { reps: [10, 10, 10], cible: 10, charge: 8 })), { reps: 12, charge: 8 });
    assert.deepEqual(J(app.formeProgression(e, { reps: [14, 14, 14], cible: 14, charge: 8 })), { reps: 10, charge: 10 });
    assert.deepEqual(J(app.formeProgression(e, { reps: [10, 8, 7], cible: 10, charge: 8 })), { reps: 10, charge: 8 });
  });
  test('minuteur : étapes travail/repos des tours, séries de force', () => {
    const s = J(app.genSeance({ duree: 30, format: 'force', materiel: MAISON }, 2));
    const steps = J(app.formeSteps(s));
    assert.ok(steps.some((x) => x.kind === 'serie') && steps.some((x) => x.kind === 'repos'));
    assert.ok(steps.every((x) => x.kind === 'serie' || x.s > 0));
  });
});

describe('course et planification', () => {
  test('séances de course : fractionné, seuil, cardio machine sans D+', () => {
    const v = J(app.genCourse('vma', 50));
    assert.equal(v.blocs[0].steps.filter((x) => x.zone === 'vma').length, 16);
    assert.equal(J(app.genCourse('velo', 40)).dplus_m, 0);
    assert.ok(J(app.genCourse('sl', 90, { terrain: 'montagne' })).dplus_m >= 400);
  });
  test('repères : zones FC (Karvonen) et allures depuis la VMA', () => {
    const pr = { fc_repos: 50, fc_max: 190, vma_kmh: 15 };
    assert.deepEqual(J(app.formeZonesFC(pr).ef), [134, 155]);
    assert.match(app.formeIntensite('ef', pr, ['fc', 'allure']), /FC 134–155 · 5:33–6:27 \/km/);
  });
  const dispos = [{ day: 1, minutes: 45, heure: '18:30' }, { day: 3, minutes: 60, heure: '18:30' }, { day: 5, minutes: 120, heure: '09:00' }, { day: 6, minutes: 45, heure: '10:00' }];
  test('cas type (Antoine, reprise) : 2 courses dont la sortie longue le samedi, 80 % en endurance, un renfo', () => {
    const p = J(app.planWeek({ lundi: '2026-11-09', dispos, profil: ANTOINE, cycleSemaine: 1 }));
    const run = p.seances.filter((s) => s.type === 'course');
    assert.equal(run.length, 2);
    assert.equal(run.find((s) => s.sous === 'sl').day, 5);
    assert.ok(run.every((s) => ['ef', 'sl'].includes(s.sous)), 'pas de séance dure en reprise au premier cycle');
    assert.ok(run.find((s) => s.sous === 'sl').dplus_m > 0, 'D+ en montagne');
    assert.equal(p.seances.filter((s) => s.type === 'renfo').length, 1);
  });
  test('progression : +10 % au plus, semaine 4 allégée, pas de hausse si la semaine précédente est peu tenue', () => {
    const w2 = J(app.planWeek({ lundi: '2026-11-16', dispos, profil: ANTOINE, cycleSemaine: 2, prevRef: 100 }));
    assert.equal(w2.ref, 110);
    assert.ok(w2.volume_min <= 110 * 1.05, `${w2.volume_min}`);
    const w4 = J(app.planWeek({ lundi: '2026-11-30', dispos, profil: ANTOINE, cycleSemaine: 4, prevRef: 120 }));
    assert.ok(w4.volume_min <= 120 * 1.1 * 0.75, `${w4.volume_min}`);
    assert.equal(J(app.planWeek({ lundi: '2026-11-16', dispos, profil: ANTOINE, cycleSemaine: 2, prevRef: 100, prevDone: 0.4 })).ref, 100);
  });
  test('jamais deux séances dures de suite (confirmé) ; affûtage avant la course cible', () => {
    const conf = { ...ANTOINE, niveau: 'confirme' };
    const all = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, minutes: 75 }));
    const p = J(app.planWeek({ lundi: '2026-11-09', dispos: all, profil: conf, cycleSemaine: 2, prevRef: 240 }));
    const hard = p.seances.filter((s) => ['sl', 'seuil', 'vma', 'fartlek'].includes(s.sous)).map((s) => s.day).sort();
    for (let i = 1; i < hard.length; i++) assert.ok(hard[i] - hard[i - 1] > 1, hard.join(','));
    const t = J(app.planWeek({ lundi: '2026-11-09', dispos: all, profil: conf, cycleSemaine: 2, prevRef: 240, objectif: { date: '2026-11-15' } }));
    assert.ok(t.taper && t.volume_min <= 240 * 1.1 * 0.65, `${t.volume_min}`);
  });
  test('check-in : maintenue, allégée, remplacée', () => {
    assert.equal(app.checkinDecision({ sommeil: 4, fatigue: 2, courbatures: 1, motivation: 4 }), 'maintenir');
    assert.equal(app.checkinDecision({ sommeil: 2, fatigue: 3, courbatures: 3, motivation: 2 }), 'alleger');
    assert.equal(app.checkinDecision({ sommeil: 1, fatigue: 5, courbatures: 2, motivation: 3 }), 'remplacer');
  });
  test('plan B : sortie longue ratée → reportée sur un footing non collé à une séance dure ; séance dure non rattrapée', () => {
    const S = [
      { id: 'a', date: '2026-11-10', type: 'course', statut: 'prevu', sous: 'fartlek', duree_min: 40 },
      { id: 'b', date: '2026-11-12', type: 'course', statut: 'prevu', sous: 'ef', duree_min: 40 },
      { id: 'c', date: '2026-11-14', type: 'course', statut: 'prevu', sous: 'sl', duree_min: 80 },
      { id: 'd', date: '2026-11-15', type: 'course', statut: 'prevu', sous: 'ef', duree_min: 30 },
    ];
    const ch = J(app.replanAfterMiss(S, 'c', '2026-11-14'));
    assert.deepEqual(ch[0], { id: 'c', patch: { statut: 'rate' } });
    assert.deepEqual(ch[1], { id: 'd', patch: { convert: 'sl', duree_min: 72 } });
    assert.equal(J(app.replanAfterMiss(S, 'a', '2026-11-10')).length, 1);
  });
  test('météo : orage signalé avec un meilleur horaire', () => {
    const time = Array.from({ length: 24 }, (_, h) => `2026-11-12T${String(h).padStart(2, '0')}:00`);
    const h = { time, weathercode: time.map((_, i) => (i >= 17 ? 95 : 1)), precipitation: time.map(() => 0), temperature_2m: time.map(() => 12) };
    assert.deepEqual(J(app.formeMeteoAlerte(h, '2026-11-12', '18:30')), { alerte: 'Orage prévu', mieux: '16:00' });
    assert.equal(app.formeMeteoAlerte(h, '2026-11-12', '10:00'), null);
  });
});

describe('suivi et intégration', () => {
  // Une sortie de 40 min (RPE 5) tous les deux jours pendant 4 semaines jusqu'au 9 novembre.
  const seances = [];
  for (let d = 0; d < 28; d += 2) { const x = new Date(2026, 10, 9 - d); seances.push({ id: `s${d}`, date: app.isoDate(x), statut: 'fait', type: 'course', duree_min: 40, rpe: 5, distance_m: 7000, dplus_m: 100 }); }
  test('charge : sRPE = durée × RPE, ratio aigu/chronique et alerte', () => {
    const c = J(app.formeCharge(seances, '2026-11-09'));
    assert.equal(c.aigue, seances.filter((x) => x.date > '2026-11-02').length * 200);
    assert.ok(c.ratio > 0.8 && c.ratio < 1.3 && c.alerte === null, JSON.stringify(c));
    const big = [...seances, { id: 'x', date: '2026-11-08', statut: 'fait', type: 'course', duree_min: 180, rpe: 9 }];
    assert.equal(J(app.formeCharge(big, '2026-11-09')).alerte, 'haute');
  });
  test('volumes hebdomadaires km et D+', () => {
    const v = J(app.formeVolumes(seances, '2026-11-09', 4));
    assert.equal(v.length, 4);
    assert.ok(v.every((w) => w.km >= 0) && v.some((w) => w.dplus > 0));
  });
  test('kcal d\'une séance : MET × poids × durée, modulés par la FC', () => {
    assert.equal(app.formeKcal({ type: 'renfo', duree_min: 30, rpe: 5 }, 80, null), Math.round(6 * 80 * 0.5 * 1));
    const lent = app.formeKcal({ type: 'course', sous: 'ef', duree_min: 60, fc_moy: 120 }, 80, { fc_repos: 50, fc_max: 190 });
    const vite = app.formeKcal({ type: 'course', sous: 'ef', duree_min: 60, fc_moy: 170 }, 80, { fc_repos: 50, fc_max: 190 });
    assert.ok(vite > lent);
  });
  test('budget adaptatif : perte 50 %, maintien 100 %, règle modifiable, seulement les séances faites', () => {
    assert.equal(app.formeBonus(400, 'perte'), 200);
    assert.equal(app.formeBonus(400, 'maintien'), 400);
    assert.equal(app.formeBonus(400, 'perte', { perte: 0.25 }), 100);
    const m = { ...app.profiles.homme, objectif: 'perte' };
    const base = app.needs(m, app.today).kcal;
    app.state.activites = [{ member_id: m.id, date: app.isoDate(app.today), kind: 'seance', statut: 'fait', kcal: 500 }, { member_id: m.id, date: app.isoDate(app.today), kind: 'seance', statut: 'prevu', kcal: 900 }];
    try { assert.equal(app.needs(m, app.today).kcal, base + 250); } finally { app.state.activites = []; }
  });
});
