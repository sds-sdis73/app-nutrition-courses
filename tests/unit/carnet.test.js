// Module « Carnet de la famille » : calendrier vaccinal, échéances, budget du mois, téléphones, sources Accueil et Agenda.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

const c = app.modules.carnet;
const plain = (o) => JSON.parse(JSON.stringify(o));
const zoe = { id: 'zoe', nom: 'Zoé', naissance: '2025-04-11' };
const lea = { id: 'lea', nom: 'Léa', naissance: '2016-09-15' };
const vide = () => ({ rdv: [], vaccins: [], echeances: [], categories: [], depenses: [], abonnements: [], contacts: [] });

describe('carnet : dates et montants', () => {
  test('ajout de mois avec fin de mois, de semaines et d\'années', () => {
    assert.equal(c.ajouterMois('2026-01-31', 1), '2026-02-28');
    assert.equal(c.ajouterMois('2024-01-31', 1), '2024-02-29');
    assert.equal(c.ajouterMois('2026-11-15', -12), '2025-11-15');
    assert.equal(c.ajouterPeriode('2026-10-21', 4, 'semaine'), '2026-11-18');
    assert.equal(c.ajouterPeriode('2026-10-21', 2, 'an'), '2028-10-21');
    assert.equal(c.ajouterPeriode('2026-10-21', 3, 'jour'), '2026-10-24');
    assert.equal(c.ecartJours('2026-10-21', '2026-10-28'), 7);
    assert.equal(c.ecartJours('2026-03-28', '2026-03-30'), 2, 'passage à l\'heure d\'été');
  });
  test('lecture et affichage des montants', () => {
    assert.equal(c.lireMontant('45,90 €'), 45.9);
    assert.equal(c.lireMontant('1 200'), 1200);
    assert.equal(c.lireMontant('12.5'), 12.5);
    assert.equal(c.lireMontant('abc'), null);
    assert.equal(c.lireMontant('0'), null);
    assert.equal(c.lireMontant('3,456'), null);
    assert.equal(c.fmtEuros(1234.5), '1 234,50 €');
  });
  test('périodicités en toutes lettres', () => {
    assert.equal(c.libellePeriode(null, null), 'Une seule fois');
    assert.equal(c.libellePeriode(1, 'an'), 'Tous les ans');
    assert.equal(c.libellePeriode(4, 'semaine'), 'Toutes les 4 semaines');
    assert.equal(c.libellePeriode(3, 'mois'), 'Tous les 3 mois');
  });
  test('quand : aujourd\'hui, demain, dans n jours, il y a n jours', () => {
    assert.equal(c.quand('2026-10-21', '2026-10-21'), 'aujourd\'hui');
    assert.equal(c.quand('2026-10-22', '2026-10-21'), 'demain');
    assert.equal(c.quand('2026-10-25', '2026-10-21'), 'dans 4 jours');
    assert.equal(c.quand('2026-10-18', '2026-10-21'), 'il y a 3 jours');
    assert.equal(c.fmtHeure('09:30:00'), '9 h 30');
    assert.equal(c.fmtHeure('14:00'), '14 h');
  });
  test('téléphones : lien tel: et affichage par paires', () => {
    assert.equal(c.telHref('06 12 34 56 78'), 'tel:0612345678');
    assert.equal(c.telHref('+33 6 12 34 56 78'), 'tel:+33612345678');
    assert.equal(c.telHref('15'), 'tel:15');
    assert.equal(c.telHref('n/a'), '');
    assert.equal(c.fmtTel('0472116911'), '04 72 11 69 11');
    assert.equal(c.fmtTel('+33612345678'), '+33 6 12 34 56 78');
    assert.equal(c.fmtTel('112'), '112');
  });
});

describe('carnet : calendrier vaccinal', () => {
  test('codes uniques ; méningocoques B et ACWY réservés aux nés depuis 2025', () => {
    const codes = c.VACCINS.map((v) => v.code);
    assert.equal(new Set(codes).size, codes.length);
    const doses = c.vaccinsPour(zoe, [], '2025-04-12').map((d) => d.code);
    for (const k of ['hexa-1', 'pneumo-1', 'rota-1', 'menb-1', 'menb-2', 'acwy-1', 'menb-3', 'acwy-2', 'ror-1', 'ror-2', 'dtcap-6']) assert.ok(doses.includes(k), k);
    assert.ok(!doses.includes('menc-1'), 'pas de méningocoque C pour une enfant née en 2025');
    const anciennes = c.vaccinsPour(lea, [], '2026-10-21').map((d) => d.code);
    assert.ok(!anciennes.includes('menb-1') && !anciennes.includes('acwy-1') && !anciennes.includes('rota-1'));
  });
  test('Zoé à 2 mois et 10 jours : les trois vaccins de 2 mois sont à faire, ceux de 3 mois à venir', () => {
    const d = Object.fromEntries(c.vaccinsPour(zoe, [], '2025-06-21').map((x) => [x.code, x]));
    assert.equal(d['hexa-1'].statut, 'a_faire');
    assert.equal(d['hexa-1'].cible, '2025-06-11');
    assert.equal(d['rota-1'].statut, 'a_faire');
    assert.equal(d['menb-1'].statut, 'a_venir');
    assert.equal(d['menb-1'].cible, '2025-07-11');
    assert.equal(d['ror-2'].limite, '2026-10-11', 'ROR 2e dose entre 16 et 18 mois');
  });
  test('doses faites, retard, rotavirus expiré, résumé', () => {
    const faits = ['hexa-1', 'pneumo-1', 'menb-1', 'hexa-2', 'pneumo-2', 'menb-2', 'acwy-1', 'hexa-3', 'pneumo-3', 'ror-1', 'menb-3', 'acwy-2']
      .map((dose) => ({ member_id: 'zoe', dose, fait_le: null }));
    const doses = c.vaccinsPour(zoe, faits, '2026-10-21');
    const d = Object.fromEntries(doses.map((x) => [x.code, x]));
    assert.equal(d['ror-2'].statut, 'retard', '18 mois passés le 11/10/2026');
    assert.equal(d['rota-1'].statut, 'expire');
    const r = c.resumeVaccins(doses);
    assert.equal(r.faits, 12);
    assert.deepEqual(plain(r.aFaire.map((v) => v.code)), ['ror-2']);
    assert.equal(r.prochains[0].code, 'dtcap-6');
    assert.equal(r.prochains[0].cible, '2031-04-11');
    assert.equal(r.total, doses.length - 3, 'les 3 doses de rotavirus expirées ne comptent pas');
  });
  test('2e dose de HPV : 6 mois après la 1re ; doses très anciennes non notées', () => {
    const faits = [{ member_id: 'lea', dose: 'hpv-1', fait_le: '2027-10-01' }];
    const d = Object.fromEntries(c.vaccinsPour(lea, faits, '2028-01-15').map((x) => [x.code, x]));
    assert.equal(d['hpv-2'].cible, '2028-04-01');
    assert.equal(d['hpv-2'].statut, 'a_venir');
    assert.equal(d['hexa-1'].statut, 'ancien');
    assert.equal(c.vaccinsPour({ nom: 'Sans date' }, [], '2026-10-21').length, 0);
  });
  test('âge des doses en toutes lettres ; adulte : seulement le prochain rappel lointain', () => {
    assert.equal(c.quandDose('11 à 14 ans'), 'entre 11 et 14 ans');
    assert.equal(c.quandDose('2 mois'), 'à 2 mois');
    const antoine = { id: 'a', nom: 'Antoine', naissance: '1990-05-10' };
    const r = c.resumeVaccins(c.vaccinsPour(antoine, [], '2026-10-21'));
    assert.deepEqual(plain(r.prochains.map((v) => v.code)), ['dtp-45']);
    assert.equal(r.aFaire.length, 0, 'rappels anciens : non notés, pas en retard');
  });
});

describe('carnet : échéances de la maison, des véhicules et des animaux', () => {
  const vermifuge = { id: 'v', categorie: 'animal', titre: 'Vermifuge', sujet: 'Les chiens', periode_nb: 3, periode_unite: 'mois', dernier: '2026-07-24', prochain: null };
  test('prochaine date calculée, niveau retard / proche / ok', () => {
    assert.equal(c.prochaineDate(vermifuge), '2026-10-24');
    assert.deepEqual(plain(c.etatEcheance(vermifuge, '2026-10-21')), { date: '2026-10-24', jours: 3, niveau: 'proche' });
    assert.equal(c.etatEcheance(vermifuge, '2026-10-30').niveau, 'retard');
    assert.equal(c.etatEcheance(vermifuge, '2026-09-01').niveau, 'ok');
    assert.equal(c.etatEcheance({ titre: 'x' }, '2026-10-21').niveau, 'aucune');
  });
  test('« Fait » reporte selon la périodicité ; une échéance ponctuelle n\'a plus de date', () => {
    const f = c.marquerFait({ ...vermifuge, tache_pour: '2026-10-24' }, '2026-10-21');
    assert.equal(f.dernier, '2026-10-21');
    assert.equal(f.prochain, '2027-01-21');
    assert.equal(f.tache_pour, null);
    assert.equal(c.marquerFait({ titre: 'Révision', prochain: '2026-10-21' }, '2026-10-21').prochain, null);
  });
  test('tâches à créer : à 7 jours, une seule fois par date', () => {
    const l = [vermifuge, { ...vermifuge, id: 'w', tache_pour: '2026-10-24' }, { id: 'loin', prochain: '2026-12-01' }];
    assert.deepEqual(plain(c.tachesACreer(l, '2026-10-21').map((e) => e.id)), ['v']);
    assert.deepEqual(plain(c.tachesACreer(l, '2026-10-10').map((e) => e.id)), []);
  });
});

describe('carnet : budget du mois', () => {
  const netflix = { id: 'n', libelle: 'Netflix', montant: 13.49, categorie_id: 'abo', date_ref: '2026-01-25', periode_nb: 1, periode_unite: 'mois', actif: true };
  test('occurrences : mensuel, annuel, hebdomadaire, en pause, fin de mois', () => {
    assert.deepEqual(plain(c.occurrences(netflix, '2026-10-01', '2026-10-31')), ['2026-10-25']);
    assert.deepEqual(plain(c.occurrences({ ...netflix, periode_unite: 'an', date_ref: '2025-03-10' }, '2026-10-01', '2026-10-31')), []);
    assert.deepEqual(plain(c.occurrences({ ...netflix, periode_unite: 'an', date_ref: '2025-10-10' }, '2026-10-01', '2026-10-31')), ['2026-10-10']);
    assert.equal(c.occurrences({ ...netflix, periode_unite: 'semaine', date_ref: '2026-10-02' }, '2026-10-01', '2026-10-31').length, 5);
    assert.deepEqual(plain(c.occurrences({ ...netflix, actif: false }, '2026-10-01', '2026-10-31')), []);
    assert.deepEqual(plain(c.occurrences({ ...netflix, date_ref: '2026-01-31' }, '2026-02-01', '2026-02-28')), ['2026-02-28']);
    assert.deepEqual(plain(c.occurrences({ ...netflix, date_ref: '2027-06-25' }, '2026-10-01', '2026-10-31')), ['2026-10-25'], 'date de référence future');
  });
  test('total du mois : dépenses saisies + prélèvements, par catégorie, dépassement', () => {
    const d = {
      categories: [{ id: 'courses', nom: 'Courses', montant: 50, ordre: 0 }, { id: 'abo', nom: 'Abonnements', montant: 30, ordre: 1 }],
      depenses: [{ id: 'd1', date: '2026-10-05', montant: 45.9, categorie_id: 'courses' }, { id: 'd2', date: '2026-10-12', montant: 12, categorie_id: 'courses' },
        { id: 'd3', date: '2026-09-30', montant: 99, categorie_id: 'courses' }, { id: 'd4', date: '2026-10-13', montant: 5, categorie_id: null }],
      abonnements: [netflix],
    };
    const b = c.budgetMois('2026-10', d, '2026-10-21');
    assert.equal(b.totalDepenses, 62.9);
    assert.equal(b.totalPrelevements, 13.49);
    assert.equal(b.total, 76.39);
    assert.equal(b.budget, 80);
    assert.equal(b.reste, 3.61);
    assert.equal(b.aVenir.length, 1);
    assert.equal(b.aVenir[0].date, '2026-10-25');
    const cat = Object.fromEntries(b.parCategorie.map((x) => [x.nom, x]));
    assert.equal(cat.Courses.depense, 57.9);
    assert.equal(cat.Courses.depasse, true);
    assert.equal(cat.Abonnements.depense, 13.49);
    assert.equal(cat['Sans catégorie'].depense, 5);
    assert.equal(b.depenses[0].id, 'd4', 'dépenses les plus récentes d\'abord');
  });
});

describe('carnet : fil de l\'Accueil et agenda', () => {
  const d = {
    ...vide(),
    rdv: [{ id: 'r1', titre: 'Pédiatre', member_id: 'zoe', date: '2026-10-22', heure: '09:30:00', lieu: 'Cabinet du Dr Martin' }],
    echeances: [{ id: 'e1', categorie: 'animal', titre: 'Vermifuge', sujet: 'Les chiens', prochain: '2026-10-20', periode_nb: 3, periode_unite: 'mois' },
      { id: 'e2', categorie: 'vehicule', titre: 'Contrôle technique', prochain: '2026-10-28' }],
    abonnements: [{ id: 'a1', libelle: 'Box', montant: 29.99, date_ref: '2026-10-22', periode_nb: 1, periode_unite: 'mois' }],
  };
  test('rappels du jour : rendez-vous à l\'heure, échéance en retard, prélèvement, vaccin à faire', () => {
    const l = c.rappelsDuJour(d, '2026-10-22', [zoe]);
    const rdv = l.find((x) => x.act === 'carnet-rdv');
    assert.equal(rdv.heure, '09:30');
    assert.equal(rdv.detail, 'Zoé · Cabinet du Dr Martin');
    assert.match(l.find((x) => /Vermifuge/.test(x.titre)).detail, /En retard de 2 jours/);
    assert.ok(!l.some((x) => /Contrôle technique/.test(x.titre)), 'échéance future absente du fil');
    assert.ok(l.some((x) => x.titre === 'Prélèvement : Box' && /29,99/.test(x.detail)));
    assert.ok(l.some((x) => x.titre === 'Vaccin à faire pour Zoé'));
  });
  test('agenda : rendez-vous, échéances, prélèvements et vaccins dans la période', () => {
    const l = c.elementsAgenda(d, '2026-10-19', '2026-10-31', [zoe], '2026-10-21');
    const ids = l.map((x) => x.id);
    assert.ok(ids.includes('carnet-rdv:r1') && ids.includes('carnet-echeance:e1') && ids.includes('carnet-echeance:e2') && ids.includes('carnet-prelevement:a1:2026-10-22'));
    assert.deepEqual(plain(l.find((x) => x.id === 'carnet-rdv:r1').membres), ['zoe']);
    const loin = c.elementsAgenda(d, '2031-04-01', '2031-04-30', [zoe], '2026-10-21');
    assert.ok(loin.some((x) => x.id === 'carnet-vaccin:zoe:dtcap-6' && x.date === '2031-04-11'));
  });
  test('le module est branché sur Agenda.sources et Accueil.sources', () => {
    assert.ok(app.Agenda.sources.some((s) => s.module === 'carnet'));
    assert.ok(app.Accueil.sources.some((s) => s.module === 'carnet'));
    assert.ok(app.Modules.notifications().some((n) => n.module === 'carnet' && n.type === 'carnet-echeances'));
    assert.equal(app.T.carnet_echeances, 'carnet_echeances');
  });
});
