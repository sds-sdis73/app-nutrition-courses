// Module « Agenda familial » : récurrences, règles iCalendar, phrase libre, jours fériés, vacances, anniversaires.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

const A = app.modules.agenda;
const plain = (o) => JSON.parse(JSON.stringify(o));
const d = (s, h = '00:00') => { const [y, m, j] = s.split('-').map(Number); const [hh, mm] = h.split(':').map(Number); return new Date(y, m - 1, j, hh, mm); };
const ev = (debut, fin, extra = {}) => ({ id: 'e1', titre: 'Test', debut: debut.toISOString(), fin: fin.toISOString(), journee: false, ...extra });
const dates = (l) => plain(l.map((o) => app.isoDate(o.debut)));
const membres = [{ id: 'z', nom: 'Zoé', naissance: '2025-04-11' }, { id: 'm', nom: 'Manon', naissance: '1991-08-02' }, { id: 'a', nom: 'Antoine', naissance: '1991-02-20' }];

describe('agenda : occurrences', () => {
  test('événement simple : dans la période ou non', () => {
    const e = ev(d('2026-11-18', '14:00'), d('2026-11-18', '15:00'));
    assert.deepEqual(dates(A.occurrences(e, d('2026-11-16'), d('2026-11-22'))), ['2026-11-18']);
    assert.equal(A.occurrences(e, d('2026-11-19'), d('2026-11-30')).length, 0);
  });
  test('hebdo, tous les mercredis, en gardant l\'heure locale au passage à l\'heure d\'hiver', () => {
    const e = ev(d('2026-10-14', '14:00'), d('2026-10-14', '15:30'), { recurrence: { freq: 'hebdo', jours: [3] } });
    const l = A.occurrences(e, d('2026-10-12'), d('2026-11-08'));
    assert.deepEqual(dates(l), ['2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04']);
    assert.ok(l.every((o) => o.debut.getHours() === 14 && o.fin.getHours() === 15 && o.fin.getMinutes() === 30));
  });
  test('une semaine sur deux, lundi et jeudi, avec une exception', () => {
    const e = ev(d('2026-11-02', '18:00'), d('2026-11-02', '19:00'), { recurrence: { freq: 'hebdo', intervalle: 2, jours: [1, 4] }, exceptions: ['2026-11-16'] });
    assert.deepEqual(dates(A.occurrences(e, d('2026-11-01'), d('2026-11-30'))), ['2026-11-02', '2026-11-05', '2026-11-19', '2026-11-30']);
  });
  test('quotidienne avec un nombre de fois (les exceptions comptent, comme COUNT)', () => {
    const e = ev(d('2026-11-10', '08:00'), d('2026-11-10', '08:30'), { recurrence: { freq: 'quotidienne', nombre: 4 }, exceptions: ['2026-11-11'] });
    assert.deepEqual(dates(A.occurrences(e, d('2026-11-01'), d('2026-12-31'))), ['2026-11-10', '2026-11-12', '2026-11-13']);
  });
  test('mensuelle le 31 : les mois sans 31 sont sautés ; date de fin incluse', () => {
    const e = ev(d('2027-01-31', '10:00'), d('2027-01-31', '11:00'), { recurrence: { freq: 'mensuelle', jusqu: '2027-05-31' } });
    assert.deepEqual(dates(A.occurrences(e, d('2027-01-01'), d('2027-12-31'))), ['2027-01-31', '2027-03-31', '2027-05-31']);
  });
  test('annuelle en journée entière (anniversaire saisi)', () => {
    const e = { id: 'b', titre: 'Anniversaire de mamie', debut: d('1960-03-12').toISOString(), fin: d('1960-03-12').toISOString(), journee: true, recurrence: { freq: 'annuelle' } };
    const l = A.occurrences(e, d('2026-01-01'), d('2027-12-31'));
    assert.deepEqual(dates(l), ['2026-03-12', '2027-03-12']);
    assert.equal(l[0].rang, 67);
  });
  test('un événement de plusieurs jours commencé avant la période y figure', () => {
    const e = { id: 'v', titre: 'Week-end', debut: d('2026-11-13').toISOString(), fin: d('2026-11-15').toISOString(), journee: true };
    assert.deepEqual(dates(A.occurrences(e, d('2026-11-15'), d('2026-11-15'))), ['2026-11-13']);
    assert.equal(A.occurrences(e, d('2026-11-16'), d('2026-11-16')).length, 0);
  });
  test('prochaine occurrence', () => {
    const e = ev(d('2026-10-14', '14:00'), d('2026-10-14', '15:00'), { recurrence: { freq: 'hebdo', jours: [3] } });
    assert.equal(app.isoDate(A.prochaine(e, d('2026-10-22', '09:00')).debut), '2026-10-28');
  });
});

describe('agenda : règles en français et iCalendar', () => {
  test('règles lisibles', () => {
    const mer = d('2026-10-14', '14:00');
    assert.equal(A.regleTexte({ freq: 'hebdo', jours: [3] }, mer), 'Tous les mercredis');
    assert.equal(A.regleTexte({ freq: 'hebdo', jours: [1, 4] }, mer), 'Tous les lundis et jeudis');
    assert.equal(A.regleTexte({ freq: 'hebdo', intervalle: 2, jours: [1, 4] }, mer), 'Une semaine sur deux, le lundi et le jeudi');
    assert.equal(A.regleTexte({ freq: 'quotidienne', nombre: 10 }, mer), 'Tous les jours, 10 fois');
    assert.equal(A.regleTexte({ freq: 'mensuelle', jusqu: '2027-06-30' }, d('2026-11-01')), 'Tous les mois, le 1er, jusqu\'au 30 juin 2027');
    assert.equal(A.regleTexte({ freq: 'annuelle' }, d('2026-12-03')), 'Tous les ans, le 3 décembre');
    assert.equal(A.regleTexte(null), '');
  });
  test('RRULE : aller et retour', () => {
    const r = { freq: 'hebdo', intervalle: 2, jours: [4, 1], nombre: 8 };
    assert.equal(A.versRRule(r), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=8');
    assert.deepEqual(plain(A.depuisRRule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=8')), { freq: 'hebdo', intervalle: 2, jours: [1, 4], nombre: 8 });
    assert.equal(A.versRRule({ freq: 'annuelle', jusqu: '2030-03-12' }, { journee: true }), 'FREQ=YEARLY;UNTIL=20300312');
    assert.deepEqual(plain(A.depuisRRule('FREQ=DAILY;UNTIL=20261231')), { freq: 'quotidienne', jusqu: '2026-12-31' });
    const z = A.versRRule({ freq: 'quotidienne', jusqu: '2026-12-31' });
    assert.match(z, /^FREQ=DAILY;UNTIL=2026123\dT\d{6}Z$/);
    assert.equal(A.depuisRRule(z.split(';')[1].replace('UNTIL', 'FREQ=DAILY;UNTIL')).jusqu, '2026-12-31');
  });
  test('RRULE non gérée entièrement : signalée', () => {
    const r = plain(A.depuisRRule('FREQ=MONTHLY;BYDAY=2WE'));
    assert.equal(r.freq, 'mensuelle');
    assert.equal(r.nonGere, true);
    assert.equal(A.depuisRRule('FREQ=SECONDLY'), null);
    assert.equal(A.depuisRRule(''), null);
  });
  test('rappels de la période, par personne', () => {
    const e = ev(d('2026-11-18', '14:00'), d('2026-11-18', '15:00'), { recurrence: { freq: 'hebdo', jours: [3] }, rappels: [{ member_id: 'm', minutes: 30 }, { member_id: 'a', minutes: 1440 }] });
    const l = A.rappelsPeriode([e], d('2026-11-17'), d('2026-11-18'));
    assert.deepEqual(plain(l.map((r) => [r.member_id, r.quand.getDate(), r.quand.getHours(), r.quand.getMinutes()])), [['a', 17, 14, 0], ['m', 18, 13, 30]]);
  });
});

describe('agenda : phrase libre', () => {
  const ctx = { maintenant: d('2026-10-21', '12:05'), membres };
  const p = (t) => plain(A.parseEvenement(t, ctx));
  test('« judo Zoé mercredi 14 h »', () => {
    const r = p('judo Zoé mercredi 14 h');
    assert.equal(r.titre, 'Judo');
    assert.equal(r.date, '2026-10-21');
    assert.equal(r.heure, '14:00');
    assert.equal(r.heureFin, '15:00');
    assert.deepEqual(r.membres, ['z']);
    assert.equal(r.categorie, 'activite');
    assert.equal(r.recurrence, null);
  });
  test('« dentiste Manon le 3 décembre à 9h30 »', () => {
    const r = p('dentiste Manon le 3 décembre à 9h30');
    assert.deepEqual([r.titre, r.date, r.heure, r.membres, r.categorie], ['Dentiste', '2026-12-03', '09:30', ['m'], 'rdv']);
  });
  test('« tous les mardis 18 h piscine »', () => {
    const r = p('tous les mardis 18 h piscine');
    assert.deepEqual([r.titre, r.date, r.heure], ['Piscine', '2026-10-27', '18:00']);
    assert.deepEqual(r.recurrence, { freq: 'hebdo', jours: [2] });
  });
  test('plage horaire, responsable de l\'aller et du retour', () => {
    const r = p('crèche Zoé demain de 8h30 à 17 h déposée par Manon récupérée par Antoine');
    assert.deepEqual([r.titre, r.date, r.heure, r.heureFin, r.membres, r.responsable, r.responsableRetour], ['Crèche', '2026-10-22', '08:30', '17:00', ['z'], 'm', 'a']);
  });
  test('« par Antoine » : il s\'en occupe sans être concerné', () => {
    const r = p('vaccin Zoé le 12/11 à 9 h par Antoine');
    assert.deepEqual([r.titre, r.date, r.membres, r.responsable, r.categorie], ['Vaccin', '2026-11-12', ['z'], 'a', 'rdv']);
  });
  test('anniversaire : journée entière, chaque année', () => {
    const r = p('anniversaire de mamie le 12 mars');
    assert.deepEqual([r.titre, r.date, r.journee, r.categorie], ['Anniversaire de mamie', '2027-03-12', true, 'anniversaire']);
    assert.deepEqual(r.recurrence, { freq: 'annuelle' });
  });
  test('autres récurrences', () => {
    assert.deepEqual(p('tous les 15 jours le lundi réunion à 20 h').recurrence, { freq: 'hebdo', intervalle: 2, jours: [1] });
    assert.deepEqual(p('chaque jour 8 h vitamine D Zoé').recurrence, { freq: 'quotidienne' });
    assert.deepEqual(p('tous les lundis et jeudis 19h foot').recurrence, { freq: 'hebdo', jours: [1, 4] });
    assert.deepEqual(p('chaque mois loyer le 5 novembre').recurrence, { freq: 'mensuelle' });
  });
  test('sans date ni récurrence : pas un événement', () => {
    assert.equal(A.parseEvenement('lait, œufs', ctx), null);
    assert.equal(A.parseEvenement('', ctx), null);
  });
  test('vers une ligne de la table evenements', () => {
    const l = plain(A.versLigne(A.parseEvenement('judo Zoé mercredi 14 h', ctx)));
    assert.equal(new Date(l.debut).getHours(), 14);
    assert.equal((new Date(l.fin) - new Date(l.debut)) / 60e3, 60);
    assert.deepEqual([l.titre, l.journee, l.membres, l.recurrence, l.exceptions], ['Judo', false, ['z'], null, []]);
    const j = plain(A.versLigne(A.parseEvenement('anniversaire de mamie le 12 mars', ctx)));
    assert.equal(j.journee, true);
    assert.equal(app.isoDate(new Date(j.debut)), '2027-03-12');
  });
  test('le « + » propose l\'événement en premier quand il y a une date', () => {
    const r = app.AjoutRapide.analyser('judo Zoé mercredi 14 h', ctx);
    assert.equal(r[0].type, 'evenement');
    assert.match(r[0].resume, /^Judo · mer\. 21 oct\. à 14 h · Zoé$/);
    assert.equal(app.AjoutRapide.analyser('acheter du pain', ctx)[0].type, 'article');
  });
});

describe('agenda : fériés, fêtes, vacances, anniversaires', () => {
  test('Pâques et jours fériés calculés', () => {
    assert.equal(app.isoDate(A.paques(2027)), '2027-03-28');
    assert.equal(app.isoDate(A.paques(2026)), '2026-04-05');
    const f = plain(A.joursFeries(2027));
    assert.equal(f.length, 11);
    assert.deepEqual(f.find((x) => x.titre === 'Lundi de Pâques').date, '2027-03-29');
    assert.deepEqual(f.find((x) => x.titre === 'Ascension').date, '2027-05-06');
    assert.deepEqual(f.find((x) => x.titre === 'Lundi de Pentecôte').date, '2027-05-17');
  });
  test('réponse de calendrier.api.gouv.fr', () => {
    assert.deepEqual(plain(A.feriesDepuisApi({ '2026-11-11': '11 novembre', '2026-11-01': 'Toussaint', x: 'y' })), [{ date: '2026-11-01', titre: 'Toussaint' }, { date: '2026-11-11', titre: '11 novembre' }]);
  });
  test('réponse de data.education.gouv.fr : jours sans classe, sans doublon enseignants', () => {
    const json = { results: [
      { description: 'Vacances de la Toussaint', start_date: '2026-10-16T22:00:00+00:00', end_date: '2026-11-01T23:00:00+00:00', population: '-' },
      { description: "Vacances d'Été", start_date: '2026-07-03T22:00:00+00:00', end_date: '2026-08-30T22:00:00+00:00', population: 'Enseignants' },
      { description: "Vacances d'Été", start_date: '2026-07-03T22:00:00+00:00', end_date: '2026-08-31T22:00:00+00:00', population: 'Élèves' },
      { description: 'Vacances de Noël', start_date: '2026-12-18T23:00:00+00:00', end_date: '2027-01-03T23:00:00+00:00', population: '-' },
    ] };
    assert.deepEqual(plain(A.vacancesDepuisApi(json)), [
      { debut: '2026-07-04', fin: '2026-08-31', titre: "Vacances d'Été" },
      { debut: '2026-10-17', fin: '2026-11-01', titre: 'Vacances de la Toussaint' },
      { debut: '2026-12-19', fin: '2027-01-03', titre: 'Vacances de Noël' },
    ]);
  });
  test('fêtes des mères (décalée si Pentecôte), des pères et des grands-mères', () => {
    const f26 = Object.fromEntries(A.fetesFamille(2026).map((x) => [x.titre, x.date]));
    assert.deepEqual(f26, { 'Fête des grands-mères': '2026-03-01', 'Fête des mères': '2026-05-31', 'Fête des pères': '2026-06-21' });
    assert.equal(A.fetesFamille(2028).find((x) => x.titre === 'Fête des mères').date, '2028-05-28');
    assert.equal(A.fetesFamille(2024).find((x) => x.titre === 'Fête des mères').date, '2024-05-26');
  });
  test('anniversaires et fêtes des membres', () => {
    const l = plain(A.anniversairesMembres(membres, d('2026-04-01'), d('2026-06-30')));
    assert.deepEqual(l.map((x) => [x.date, x.titre, x.detail]), [['2026-04-11', 'Anniversaire de Zoé', '1 an'], ['2026-05-02', 'Fête de Zoé', 'Fête du prénom'], ['2026-06-13', 'Fête d\'Antoine', 'Fête du prénom']]);
    assert.equal(A.anniversairesMembres(membres, d('2026-04-01'), d('2026-06-30'), { fetes: false }).length, 1);
  });
  test('couleur par membre : choix enregistré, sinon dans l\'ordre du foyer', () => {
    assert.equal(A.slotMembre('m', membres, {}), 'm2');
    assert.equal(A.slotMembre('m', membres, { m: 'm5' }), 'm5');
    assert.equal(A.slotMembre('m', membres, { m: 'rouge' }), 'm2');
  });
  test('formats : heures et périodes', () => {
    assert.equal(A.fmtHeure('09:30'), '9 h 30');
    assert.equal(A.fmtHeure('14:00'), '14 h');
    assert.equal(A.titrePeriode('semaine', d('2026-10-21')), 'Du 19 au 25 octobre');
    assert.equal(A.titrePeriode('semaine', d('2026-10-28')), 'Du 26 octobre au 1er novembre');
    assert.equal(A.titrePeriode('mois', d('2026-10-21')), 'Octobre 2026');
    assert.equal(A.titrePeriode('jour', d('2026-11-01')), 'Dimanche 1er novembre');
    assert.deepEqual(plain(A.periode('mois', d('2026-10-21')).map((x) => app.isoDate(x))), ['2026-09-28', '2026-11-01']);
  });
});

describe('règles venues d\'un autre agenda et notifications de modification', () => {
  test('« 2e mardi du mois » (BYDAY=2TU) : dates exactes, règle gardée et libellé lisible', () => {
    const rec = plain(A.depuisRRule('FREQ=MONTHLY;BYDAY=2TU'));
    assert.deepEqual(rec, { freq: 'mensuelle', nonGere: true, rrule: 'FREQ=MONTHLY;BYDAY=2TU' });
    const e = ev(d('2026-11-10', '18:00'), d('2026-11-10', '19:00'), { recurrence: rec });
    assert.deepEqual(dates(A.occurrences(e, d('2026-11-01'), d('2027-01-31'))), ['2026-11-10', '2026-12-08', '2027-01-12']);
    assert.equal(A.regleTexte(rec, e.debut), 'Tous les mois, le 2e mardi');
    assert.equal(A.versRRule(rec), 'FREQ=MONTHLY;BYDAY=2TU');
    // Dernier vendredi, 3 fois.
    const der = ev(d('2026-10-30', '18:00'), d('2026-10-30', '19:00'), { recurrence: plain(A.depuisRRule('FREQ=MONTHLY;BYDAY=-1FR;COUNT=3')) });
    assert.deepEqual(dates(A.occurrences(der, d('2026-10-01'), d('2027-03-31'))), ['2026-10-30', '2026-11-27', '2026-12-25']);
    assert.equal(A.regleTexte(der.recurrence, der.debut), 'Tous les mois, le dernier vendredi, 3 fois');
    // Autre règle non calculable : dates signalées approximatives.
    assert.match(A.regleTexte(plain(A.depuisRRule('FREQ=MONTHLY;BYMONTHDAY=1,15')), e.debut), /dates approximatives/);
  });
  test('« agenda modifié » : un nouvel identifiant à chaque modification (regroupées par 2 minutes)', () => {
    const t = Date.UTC(2026, 10, 16, 10, 0, 0);
    assert.equal(A.idModif('e1', t), A.idModif('e1', t + 60000));
    assert.notEqual(A.idModif('e1', t), A.idModif('e1', t + 24 * 3600e3));
    assert.match(A.idModif('e1', t), /^agenda-modif:e1:\d+$/);
  });
});
