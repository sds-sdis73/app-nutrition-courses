// Module « Tâches et listes » : analyse de phrase, récurrence, regroupements, listes types, envies.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

const M = app.modules.taches;
const plain = (o) => JSON.parse(JSON.stringify(o));
const maintenant = new Date(2026, 9, 21, 12, 5); // mercredi 21 octobre 2026
const membres = [{ id: 'z', nom: 'Zoé' }, { id: 'a', nom: 'Antoine' }, { id: 'm', nom: 'Manon' }];
const at = (t) => plain(M.analyseTache(t, { maintenant, membres }));

describe('analyse d\'une tâche en phrase libre', () => {
  test('« sortir les poubelles mardi » : mardi prochain, sans responsable', () => {
    const r = at('sortir les poubelles mardi');
    assert.equal(r.titre, 'Sortir les poubelles');
    assert.equal(r.echeance, '2026-10-27');
    assert.equal(r.responsable, null);
    assert.equal(r.recurrence, null);
    assert.ok(r.score >= 0.7);
  });
  test('« appeler le véto avant vendredi Antoine » : échéance vendredi, Antoine responsable', () => {
    const r = at('appeler le véto avant vendredi Antoine');
    assert.equal(r.titre, 'Appeler le véto');
    assert.equal(r.echeance, '2026-10-23');
    assert.equal(r.responsable, 'a');
    assert.ok(r.score >= 0.85);
  });
  test('récurrences : tous les mardis, toutes les 2 semaines, chaque mois, tous les ans', () => {
    const r = at('sortir les poubelles tous les mardis');
    assert.deepEqual(r.recurrence, { freq: 'semaine', n: 1 });
    assert.equal(r.echeance, '2026-10-27');
    assert.equal(r.titre, 'Sortir les poubelles');
    assert.deepEqual(at('arroser les plantes toutes les 2 semaines').recurrence, { freq: 'semaine', n: 2 });
    assert.deepEqual(at('payer la cantine chaque mois le 5 novembre').recurrence, { freq: 'mois', n: 1, jour: 5 });
    assert.deepEqual(at('ramoner la cheminée tous les ans').recurrence, { freq: 'an', n: 1 });
    assert.deepEqual(at('nourrir les chiens tous les jours').recurrence, { freq: 'jour', n: 1 });
    assert.equal(at('vermifuger les chiens chaque mercredi').echeance, '2026-10-21', 'aujourd\'hui si c\'est le bon jour');
  });
  test('« penser à », « il faut », « urgent », « ! » ; heure et date écrite', () => {
    const r = at('penser à réserver le train pour Manon le 3 novembre urgent');
    assert.equal(r.titre, 'Réserver le train');
    assert.equal(r.echeance, '2026-11-03');
    assert.equal(r.responsable, 'm');
    assert.equal(r.priorite, 1);
    assert.equal(at('il faut rappeler la crèche demain 9h30').heure, '09:30');
    assert.equal(at('il faut rappeler la crèche demain 9h30').titre, 'Rappeler la crèche');
    assert.equal(at('payer les impôts !').priorite, 1);
    assert.equal(at('prendre rendez-vous chez le dentiste').score, 0.85);
  });
  test('sans verbe ni date : score faible ; liste à virgules : très faible ; vide : nul', () => {
    assert.ok(at('pneus neige').score <= 0.2);
    assert.ok(at('lait, œufs').score <= 0.1);
    assert.equal(at('   ').score, 0);
  });
});

describe('bouton « + » : l\'analyseur de tâche face aux autres', () => {
  const ctx = { maintenant, membres };
  const premier = (t) => app.AjoutRapide.analyser(t, ctx)[0]?.type;
  test('les tâches sont reconnues ; les courses, repas et séances gardent leur place', () => {
    assert.equal(premier('sortir les poubelles mardi'), 'tache');
    assert.equal(premier('appeler le véto avant vendredi Antoine'), 'tache');
    assert.equal(premier('acheter du pain'), 'article');
    assert.notEqual(premier('lait, œufs'), 'tache');
    assert.equal(premier('30 min de course à pied'), 'seance');
  });
  test('le résumé dit l\'échéance et le responsable', () => {
    const p = app.AjoutRapide.analyser('appeler le véto avant vendredi Antoine', ctx).find((x) => x.type === 'tache');
    assert.equal(p.resume, 'Appeler le véto · vendredi · Antoine');
  });
});

describe('récurrence sans rotation : prochaine occurrence', () => {
  const auj = '2026-10-21';
  test('semaine : de l\'échéance, une semaine plus tard', () => {
    assert.equal(M.prochaineEcheance('2026-10-21', { freq: 'semaine', n: 1 }, auj), '2026-10-28');
    assert.equal(M.prochaineEcheance('2026-10-23', { freq: 'semaine', n: 2 }, auj), '2026-11-06');
  });
  test('en retard : on reprend au prochain créneau après aujourd\'hui', () => {
    assert.equal(M.prochaineEcheance('2026-10-06', { freq: 'semaine', n: 1 }, auj), '2026-10-27');
    assert.equal(M.prochaineEcheance('2026-10-01', { freq: 'jour', n: 1 }, auj), '2026-10-22');
  });
  test('mois : le jour d\'origine est gardé, raccourci en fin de mois', () => {
    assert.equal(M.prochaineEcheance('2026-01-31', { freq: 'mois', n: 1, jour: 31 }, '2026-01-31'), '2026-02-28');
    assert.equal(M.prochaineEcheance('2026-02-28', { freq: 'mois', n: 1, jour: 31 }, '2026-02-28'), '2026-03-31');
    assert.equal(M.prochaineEcheance('2026-10-15', { freq: 'mois', n: 3 }, auj), '2027-01-15');
  });
  test('année, et sans échéance (à partir d\'aujourd\'hui)', () => {
    assert.equal(M.prochaineEcheance('2024-02-29', { freq: 'an', n: 1 }, '2024-03-01'), '2025-02-28');
    assert.equal(M.prochaineEcheance(null, { freq: 'semaine', n: 1 }, auj), '2026-10-28');
    assert.equal(M.prochaineEcheance('2026-10-21', null, auj), null);
  });
  test('libellés', () => {
    assert.equal(M.libelleRecurrence({ freq: 'semaine', n: 1 }), 'Chaque semaine');
    assert.equal(M.libelleRecurrence({ freq: 'semaine', n: 2 }), 'Toutes les 2 semaines');
    assert.equal(M.libelleRecurrence({ freq: 'mois', n: 6 }), 'Tous les 6 mois');
    assert.equal(M.libelleRecurrence({ freq: 'an', n: 1 }), 'Chaque année');
    assert.equal(M.libelleRecurrence(null), '');
  });
});

describe('échéances et regroupements', () => {
  const auj = '2026-10-21';
  test('libellés d\'échéance', () => {
    assert.equal(M.libelleEcheance('2026-10-21', auj), 'Aujourd\'hui');
    assert.equal(M.libelleEcheance('2026-10-22', auj), 'Demain');
    assert.equal(M.libelleEcheance('2026-10-20', auj), 'Hier');
    assert.equal(M.libelleEcheance('2026-10-23', auj), 'Vendredi');
    assert.match(M.libelleEcheance('2026-11-03', auj), /^mar\.? 3 nov\.?$/);
    assert.match(M.libelleEcheance('2027-01-05', auj), /2027/);
  });
  test('groupes : en retard, aujourd\'hui, demain, cette semaine, plus tard, sans échéance ; les faites à part', () => {
    const t = [
      { id: 1, titre: 'B', echeance: '2026-10-19' }, { id: 2, titre: 'A', echeance: '2026-10-21', priorite: 1 }, { id: 3, titre: 'C', echeance: '2026-10-21' },
      { id: 4, titre: 'D', echeance: '2026-10-22' }, { id: 5, titre: 'E', echeance: '2026-10-26' }, { id: 6, titre: 'F', echeance: '2026-12-01' },
      { id: 7, titre: 'G' }, { id: 8, titre: 'H', echeance: '2026-10-21', fait: true },
    ];
    const g = plain(M.groupesTaches(t, auj));
    assert.deepEqual(g.map((x) => x.cle), ['retard', 'jour', 'demain', 'semaine', 'tard', 'sans']);
    assert.deepEqual(g[1].taches.map((x) => x.id), [2, 3], 'l\'importante d\'abord à échéance égale');
    assert.ok(!g.flatMap((x) => x.taches).some((x) => x.id === 8));
  });
  test('fil de l\'Accueil : du jour et en retard, pour la personne ou toute la famille', () => {
    const t = [
      { id: 'r', titre: 'Vaccin des chiens', echeance: '2026-10-18', responsable: 'a' },
      { id: 'j', titre: 'Poubelles', echeance: '2026-10-21', heure: '19:00' },
      { id: 'm', titre: 'Crèche', echeance: '2026-10-21', responsable: 'm' },
      { id: 'd', titre: 'Plus tard', echeance: '2026-10-25' }, { id: 'f', titre: 'Faite', echeance: '2026-10-20', fait: true },
    ];
    const nom = (id) => membres.find((x) => x.id === id)?.nom || '';
    const moi = plain(M.elementsAccueil(t, { iso: '2026-10-21', membre: { id: 'a' }, nom }));
    assert.deepEqual(moi.map((x) => x.data.id), ['r', 'j']);
    assert.match(moi[0].detail, /^En retard \(dim\.? 18 oct\.?\) · Antoine$/);
    assert.equal(moi[0].priorite, 2);
    assert.equal(moi[1].heure, '19:00');
    assert.equal(moi[0].act, 'taches-ouvrir');
    const famille = plain(M.elementsAccueil(t, { iso: '2026-10-21', membre: { id: 'a' }, famille: true, nom }));
    assert.deepEqual(famille.map((x) => x.data.id).sort(), ['j', 'm', 'r']);
  });
});

describe('listes et listes types', () => {
  test('5 listes types fournies, pré-remplies, en français accentué', () => {
    assert.deepEqual(plain(M.MODELES.map((m) => m.titre)), ['Avant départ', 'Avant nounou', 'Valise ski', 'Valise plage', 'Mode vacances']);
    for (const m of M.MODELES) assert.ok(M.elementsModele(m).length >= 10, `${m.titre} trop courte`);
    const vac = M.MODELES.find((m) => m.cle === 'vacances');
    assert.deepEqual(Object.keys(vac.sections), ['Valise', 'Chiens', 'Maison', 'Courses de départ']);
    for (const mot of ['Fermer les volets', 'Arroser les plantes ou les confier', 'Sortir les poubelles', 'Faire suivre ou relever le courrier']) assert.ok(vac.sections.Maison.includes(mot), mot);
    const textes = M.MODELES.flatMap((m) => M.elementsModele(m).map((e) => e.texte)).join(' ');
    assert.doesNotMatch(textes, /\b(Debrancher|Eteindre|Equipement|Vetements|creme|telephone)\b/, 'accents oubliés');
    assert.doesNotMatch(textes, / '|' /, 'apostrophe mal placée');
  });
  test('lancer une liste type : copie décochée, ordre conservé, titre de vacances avec les dates', () => {
    let n = 0;
    const nouvelId = () => `id${++n}`;
    const vac = M.MODELES.find((m) => m.cle === 'vacances');
    const els = M.elementsModele(vac);
    const c = plain(M.copieModele({ id: 'modele:vacances', ...vac }, els, { date_debut: '2026-12-19', date_fin: '2026-12-26', nouvelId }));
    assert.equal(c.liste.titre, 'Vacances du 19 au 26 décembre');
    assert.equal(c.liste.est_modele, false);
    assert.equal(c.liste.modele_id, null, 'liste type fournie : pas d\'identifiant en base');
    assert.equal(c.elements.length, els.length);
    assert.ok(c.elements.every((e) => e.liste_id === c.liste.id && e.coche === false));
    assert.deepEqual(c.elements.map((e) => e.texte), plain(els.map((e) => e.texte)));
    const perso = plain(M.copieModele({ id: 'abc', titre: 'Valise ski', genre: 'ski' }, [{ texte: 'Raquettes', ordre: 3 }, { texte: 'Luge', ordre: 1, coche: true }], { nouvelId }));
    assert.equal(perso.liste.modele_id, 'abc');
    assert.equal(perso.liste.titre, 'Valise ski');
    assert.deepEqual(perso.elements.map((e) => [e.texte, e.coche, e.ordre]), [['Luge', false, 0], ['Raquettes', false, 1]]);
  });
  test('titres de vacances', () => {
    assert.equal(M.titreVacances('2026-12-30', '2027-01-04'), 'Vacances du 30 décembre au 4 janvier');
    assert.equal(M.titreVacances('2026-07-01', '2026-07-14'), 'Vacances du 1er au 14 juillet');
    assert.equal(M.titreVacances('2026-07-25', '2026-08-01'), 'Vacances du 25 juillet au 1er août');
    assert.equal(M.titreVacances(null, null), 'Vacances');
  });
  test('progression et rubriques', () => {
    const els = [{ texte: 'a', ordre: 2, section: 'Maison', coche: true }, { texte: 'b', ordre: 0, section: 'Valise' }, { texte: 'c', ordre: 1, section: 'Maison' }, { texte: 'd', ordre: 3 }];
    assert.deepEqual(plain(M.progression(els)), { faits: 1, total: 4, pct: 25 });
    assert.deepEqual(plain(M.progression([])), { faits: 0, total: 0, pct: 0 });
    assert.deepEqual(plain(M.sectionsDe(els).map((g) => [g.section, g.elements.map((e) => e.texte)])), [['', ['d']], ['Valise', ['b']], ['Maison', ['c', 'a']]]);
  });
});

describe('envies : « je m\'en occupe » caché à la personne concernée', () => {
  const envie = { id: 'e1', member_id: 'a' };
  const resa = { envie_id: 'e1', member_id: 'a', user_id: 'u-manon' };
  test('visible pour les autres, jamais pour la personne concernée', () => {
    assert.equal(M.reservationVisible(envie, resa, 'm'), true);
    assert.equal(M.reservationVisible(envie, resa, 'a'), false);
    assert.equal(M.reservationVisible(envie, null, 'm'), false);
    assert.equal(M.reservationVisible(envie, { ...resa, envie_id: 'autre' }, 'm'), false);
  });
  test('compte pas encore relié à son profil : aucune réservation visible (il pourrait être la personne concernée)', () => {
    assert.equal(M.reservationVisible(envie, resa, null), false);
    assert.equal(M.reservationVisible(envie, resa, ''), false);
  });
  test('la politique SQL refuse la lecture sans profil relié (« <> » et non « is distinct from »)', () => {
    const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'supabase', 'migrations', '2026-11-16_taches.sql'), 'utf8');
    const pol = sql.slice(sql.indexOf('create policy "foyer_sauf_beneficiaire"'), sql.indexOf('create index if not exists envies_reservations_foyer'));
    assert.match(pol, /member_id <> \(select mon_membre\(\)\)/);
    assert.doesNotMatch(pol, /is distinct from/);
  });
  test('une tâche confiée de nouveau à la même personne fait une nouvelle notification', () => {
    const t = { id: 't1', responsable: 'm' };
    assert.notEqual(M.idConfiee(t, 1000), M.idConfiee(t, 2000));
    assert.match(M.idConfiee(t, 1000), /^tache-confiee:t1:m:/);
  });
});

describe('enregistrement du module', () => {
  test('segment Famille › Tâches & listes, tables, analyseur « tâche », notifications', () => {
    const m = app.Modules.get('taches');
    assert.equal(m.onglet, 'famille');
    assert.equal(m.segment, 'Tâches & listes');
    for (const t of ['taches', 'listes', 'liste_elements', 'envies', 'envies_reservations']) assert.equal(app.T[t], t);
    assert.ok(app.AjoutRapide.pour('tache'), 'le type « tâche » du « + » n\'est plus grisé');
    assert.ok(app.Modules.notifications().some((n) => n.module === 'taches' && n.type === 'taches'));
  });
});
