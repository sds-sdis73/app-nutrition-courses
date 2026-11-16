// Accueil et notifications : fil moi / famille, briefing du soir, réglages par personne, règles de la fonction send-reminders.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const app = require('./_app');

const A = app.modules['accueil-famille'];
const N = app.modules.notifications;
const regles = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'supabase', 'functions', 'send-reminders', 'regles.js')).href);
const plain = (x) => JSON.parse(JSON.stringify(x));
// Les valeurs viennent du bac à sable de la page (autre « realm ») : comparaison sur leur copie JSON.
const eq = (a, b, msg) => assert.deepEqual(plain(a), plain(b), msg);

const MEMBRES = [{ id: 'a', nom: 'Antoine' }, { id: 'm', nom: 'Manon' }, { id: 'z', nom: 'Zoé' }];
const ENFANTS = ['z'];
const ELEMENTS = [
  { type: 'trajet', titre: 'Déposer Zoé', heure: '08:30', membres: ['a'], pour: ['z'], sens: 'depot' },
  { type: 'trajet', titre: 'Récupérer Zoé', heure: '17:00', membres: [], pour: ['z'], sens: 'retour' },
  { type: 'evenement', titre: 'Dentiste', heure: '14:00', membres: ['m'] },
  { type: 'evenement', titre: 'Dentiste', heure: '14:00', membres: ['m'] }, // doublon
  { type: 'tache', titre: 'Sortir les poubelles', heure: null, membres: ['a'] },
  { type: 'seance', titre: 'Course 45 min', heure: '18:30', membres: ['a'] },
  { type: 'repas', titre: 'Gratin de courge', heure: '19:30', creneau: 'soir', membres: [] },
  { type: 'evenement', titre: 'Anniversaire de mamie', heure: null, membres: [] },
];

test('notifications : la liste des types et les règles du client sont celles de la fonction send-reminders', async () => {
  const R = await regles();
  eq(plain(N.TYPES_NOTIF), plain(R.TYPES_NOTIF));
  eq(plain(N.PREFS_DEFAUT), plain(R.PREFS_DEFAUT));
  const cas = [[null, null], [null, { bilan: false, courses_day: 2 }], [{ types: { bilan: true, agenda_modifs: true, perso: false }, silence_debut: 23, silence_fin: 6, regrouper: false }, { bilan: false }],
    [{ silence_actif: false, briefing_heure: 'x', rappel_min: 120 }, {}]];
  for (const [l, a] of cas) eq(plain(N.prefsEffectives(l, a)), plain(R.prefsEffectives(l, a)));
  for (const h of [0, 6, 7, 12, 21, 22, 23]) for (const p of cas.map(([l, a]) => R.prefsEffectives(l, a))) assert.equal(N.enSilence(p, h), R.enSilence(p, h));
  const b1 = A.composerBriefing({ elements: ELEMENTS, membres: MEMBRES, moi: 'a' });
  const b2 = R.composerBriefing({ elements: ELEMENTS, membres: MEMBRES, moi: 'a' });
  eq(plain(b1), plain(b2));
});

test('notifications : réglage par personne, puis ancien réglage de l\'abonnement, puis valeur par défaut', () => {
  const p0 = N.prefsEffectives(null, null);
  assert.equal(p0.types.briefing, true);
  assert.equal(p0.types.agenda_modifs, false, 'peu de notifications par défaut');
  assert.equal(p0.types.courses_modif, false);
  assert.equal(p0.silence_actif, true);
  eq([p0.silence_debut, p0.silence_fin, p0.briefing_heure, p0.rappel_min], [22, 7, 19, 60]);
  const p1 = N.prefsEffectives(null, { bilan: false, courses_day: 2, courses_hour: 18 });
  assert.equal(p1.types.bilan, false, 'ancien réglage repris');
  eq([p1.courses_day, p1.courses_hour], [2, 18]);
  const p2 = N.prefsEffectives({ types: { bilan: true, perso: false }, courses_day: 4 }, { bilan: false, courses_day: 2 });
  assert.equal(p2.types.bilan, true, 'la ligne notif_prefs l\'emporte');
  assert.equal(p2.types.perso, false, 'type déclaré par un autre module');
  assert.equal(p2.courses_day, 4);
  assert.equal(N.veut(p2, 'perso'), false);
  assert.equal(N.veut(p2, 'inconnu'), true);
  assert.equal(N.veut({ types: { test: false } }, 'test'), true, 'le test passe toujours');
  eq(plain(N.prefsAnciennes(p2)), { batch: true, congel: true, courses: true, planning: true, bilan: true, seance: true, dispos: true, courses_day: 4, courses_hour: 9 });
});

test('notifications : heures de silence, y compris quand elles passent minuit', () => {
  const nuit = { silence_actif: true, silence_debut: 22, silence_fin: 7 };
  eq([21, 22, 23, 0, 6, 7, 12].map((h) => N.enSilence(nuit, h)), [false, true, true, true, true, false, false]);
  const sieste = { silence_actif: true, silence_debut: 13, silence_fin: 15 };
  eq([12, 13, 14, 15].map((h) => N.enSilence(sieste, h)), [false, true, true, false]);
  assert.equal(N.enSilence({ ...nuit, silence_actif: false }, 23), false);
  assert.equal(N.enSilence({ silence_actif: true, silence_debut: 8, silence_fin: 8 }, 8), false, 'plage vide');
  assert.equal(N.libelleSilence(nuit), 'de 22 h à 7 h');
});

test('notifications : types déclarés par les modules ajoutés au groupe « Autres »', () => {
  const l = N.typesAffiches([{ type: 'briefing', libelle: 'Doublon' }, { type: 'carnet_vaccins', libelle: 'Vaccins' }]);
  assert.equal(l.filter((t) => t.type === 'briefing').length, 1);
  assert.equal(l.at(-1).type, 'carnet_vaccins');
  assert.equal(l.at(-1).groupe, 'autres');
});

test('send-reminders : rappel dû au plus tôt d\'un passage du cron, jamais après l\'événement', async () => {
  const R = await regles();
  const evt = 14 * 60 + 30; // 14 h 30
  assert.equal(R.rappelDu(evt, 12 * 60, 60), false, '12 h : trop tôt');
  assert.equal(R.rappelDu(evt, 13 * 60, 60), true, '13 h : dernier passage avant 13 h 30');
  assert.equal(R.rappelDu(evt, 14 * 60, 60), true);
  assert.equal(R.rappelDu(evt, 15 * 60, 60), false, 'passé');
});

test('send-reminders : notifications d\'un même passage regroupées en une seule', async () => {
  const R = await regles();
  const m = [{ type: 'bilan', title: 'Bilan du soir', body: 'Un coup d\'œil ?', url: './#suivi' }, { type: 'briefing', title: 'Demain', body: 'Dentiste à 14 h', url: './#aujourdhui' }];
  assert.equal(R.regrouper([], true).length, 0);
  eq(R.regrouper(m.slice(0, 1), true), [{ title: 'Bilan du soir', body: 'Un coup d\'œil ?', url: './#suivi', tag: 'bilan' }]);
  const g = R.regrouper(m, true);
  assert.equal(g.length, 1);
  assert.equal(g[0].title, 'Tribu & Toutous · 2 nouvelles');
  assert.equal(g[0].body, '• Bilan du soir : Un coup d\'œil ?\n• Demain : Dentiste à 14 h');
  assert.equal(R.regrouper(m, false).length, 2, 'regroupement désactivé');
});

test('briefing : un groupe par membre (moi d\'abord), le foyer à la fin, phrases en français', () => {
  const b = A.composerBriefing({ elements: ELEMENTS, membres: MEMBRES, moi: 'a' });
  eq(b.groupes.map((g) => g.membre?.nom || 'foyer'), ['Antoine', 'Manon', 'Zoé', 'foyer']);
  eq(b.groupes[0].lignes.map((l) => l.texte), ['dépose Zoé à 8 h 30', 'Course 45 min à 18 h 30', 'Sortir les poubelles']);
  eq(b.groupes[1].lignes.map((l) => l.texte), ['Dentiste à 14 h'], 'doublon retiré');
  eq(b.groupes[2].lignes.map((l) => l.texte), ['Retour de Zoé à 17 h : personne n\'est désigné']);
  eq(b.groupes[3].lignes.map((l) => l.texte), ['Soir : Gratin de courge', 'Anniversaire de mamie']);
  assert.equal(b.nb, 7);
  assert.equal(b.resume.split('\n')[0], 'Toi : dépose Zoé à 8 h 30 · Course 45 min à 18 h 30 · Sortir les poubelles');
  assert.match(b.resume, /Manon : Dentiste à 14 h/);
  const famille = A.composerBriefing({ elements: ELEMENTS, membres: MEMBRES });
  assert.equal(famille.groupes[0].membre.nom, 'Antoine');
  assert.equal(A.composerBriefing({ elements: [], membres: MEMBRES }).resume, 'Rien de prévu demain : une journée tranquille.');
  const moi = A.briefingPourMoi(b, 'a', ENFANTS);
  eq(moi.groupes.map((g) => g.membre?.nom || 'foyer'), ['Antoine', 'Zoé', 'foyer'], 'vue « moi » : moi, les enfants, le foyer');
  assert.equal(A.heureFr('09:05'), '9 h 05');
  assert.equal(A.heureFr('14:00'), '14 h');
});

test('briefing : trajets d\'enfant reconnus par le titre ou le champ trajet', () => {
  eq(plain(A.detecterTrajet({ titre: 'Déposer Zoé à la crèche', membres: ['a'] }, MEMBRES, ENFANTS)), { sens: 'depot', qui: ['a'], pour: ['z'] });
  eq(plain(A.detecterTrajet({ titre: 'Récupérer à la nounou', membres: ['m', 'z'] }, MEMBRES, ENFANTS)), { sens: 'retour', qui: ['m'], pour: ['z'] });
  assert.equal(A.detecterTrajet({ titre: 'Dentiste', membres: ['m'] }, MEMBRES, ENFANTS), null);
  assert.equal(A.detecterTrajet({ titre: 'Déposer le colis', membres: ['a'] }, MEMBRES, ENFANTS), null, 'sans enfant, pas de trajet');
  eq(plain(A.detecterTrajet({ titre: 'Crèche', trajet: { sens: 'retour', qui: ['a'], pour: ['z'] } }, MEMBRES, ENFANTS)), { sens: 'retour', qui: ['a'], pour: ['z'] });
});

test('briefing : éléments classés depuis l\'agenda et le fil des modules, sans doublon', () => {
  const agenda = [
    { source: 'planning', titre: 'Gratin', heure: '19:30', membres: [] },
    { source: 'agenda', titre: 'Déposer Zoé', heure: '08:30', membres: ['a'] },
    { source: 'agenda', titre: 'Judo', heure: '14:00', membres: ['z'] },
    { source: 'taches', titre: 'Vaccin du chien', membres: ['m'] },
  ];
  const accueil = [
    { module: 'agenda', titre: 'Judo', heure: '14:00' },
    { module: 'accueil-famille', titre: 'Dîner : Gratin', heure: '19:30', type: 'repas' },
    { module: 'taches', titre: 'Vaccin du chien', membres: ['m'] },
    { module: 'carnet', titre: 'Vermifuge', heure: '09:00', membres: [] },
  ];
  const l = A.classerBriefing({ agenda, accueil, seances: [{ titre: 'Renfo', heure: '07:00', membres: ['a'] }], membres: MEMBRES, enfants: ENFANTS });
  eq(l.map((e) => `${e.type}:${e.titre}`), ['repas:Gratin', 'trajet:Déposer Zoé', 'evenement:Judo', 'tache:Vaccin du chien', 'evenement:Vermifuge', 'seance:Renfo']);
  assert.equal(l[0].creneau, 'soir');
  eq(l[1].pour, ['z']);
});

test('fil : « moi » garde ce qui me concerne (moi, les enfants, le foyer) ; « famille » se filtre par membre', () => {
  const els = [{ titre: 'Foyer' }, { titre: 'Moi', membres: ['a'] }, { titre: 'Manon', membres: ['m'] }, { titre: 'Zoé', membres: ['z'] }];
  eq(A.filtrerFil(els, { mode: 'moi', moi: 'a', enfants: ENFANTS }).map((e) => e.titre), ['Foyer', 'Moi', 'Zoé']);
  eq(A.filtrerFil(els, { mode: 'famille' }).map((e) => e.titre), ['Foyer', 'Moi', 'Manon', 'Zoé']);
  eq(A.filtrerFil(els, { mode: 'famille', filtre: 'm' }).map((e) => e.titre), ['Manon']);
  assert.equal(A.concerne({ membres: ['m'] }, 'a', ENFANTS), false);
});

test('fil : une couleur par membre, prise dans les jetons de l\'univers', () => {
  const c = [0, 1, 2, 3, 4, 5, -1].map(A.couleurMembre);
  assert.equal(c[0], 'var(--m1, var(--primary))');
  assert.equal(c[5], c[0], 'on reboucle');
  assert.equal(c[6], c[4]);
  assert.ok(c.every((x) => /^var\(--[a-z0-9-]+, var\(--[a-z-]+\)\)$/.test(x)), 'jamais de couleur en dur');
  assert.equal(A.briefingVisible(new Date(2026, 9, 21, 17, 59)), false);
  assert.equal(A.briefingVisible(new Date(2026, 9, 21, 18, 0)), true);
});

test('rappels : événements à venir avec heure, tâches datées le matin, repas et séances exclus', () => {
  const maintenant = new Date(2026, 9, 21, 12, 5);
  const r = A.rappelsAgenda([
    { id: 'e1', source: 'agenda', date: '2026-10-21', heure: '14:30', titre: 'Pédiatre', detail: 'Zoé', membres: ['z'] },
    { id: 'e2', source: 'agenda', date: '2026-10-21', heure: '09:00', titre: 'Passé' },
    { id: 'e3', source: 'agenda', date: '2026-10-22', heure: '08:30', titre: 'Crèche' },
    { id: 'e4', source: 'agenda', date: '2026-10-22', titre: 'Journée sans heure' },
    { id: 'p1', source: 'planning', date: '2026-10-22', heure: '12:30', titre: 'Gratin' },
    { id: 's1', source: 'forme', date: '2026-10-22', heure: '18:00', titre: 'Course' },
    { id: 't1', source: 'taches', date: '2026-10-22', titre: 'Poubelles', membres: ['a'] },
  ], maintenant);
  eq(r.map((x) => x.id), ['evt:agenda:e1:2026-10-21', 'evt:agenda:e3:2026-10-22', 'tache:t1:2026-10-22']);
  assert.equal(r[0].corps, 'Aujourd\'hui à 14 h 30 · Zoé');
  assert.equal(r[1].corps, 'Demain à 8 h 30');
  eq(r[0].pour_membres, ['z']);
  assert.equal(r[0].evenement_a.getHours(), 14);
  assert.equal(r[2].envoyer_a.getHours(), 8);
  assert.equal(r[2].type, 'taches');
});

test('modules : Accueil › Famille et Plus › Notifications enregistrés à la place des écrans d\'attente', () => {
  const f = app.Modules.get('accueil-famille');
  const n = app.Modules.get('notifications');
  assert.equal(f.onglet, 'accueil');
  assert.equal(f.segment, 'Aujourd\'hui');
  assert.equal(n.onglet, 'plus');
  assert.equal(app.T.notif_prefs, 'notif_prefs');
  assert.equal(app.T.notif_file, 'notif_file');
  assert.ok(app.ACTIONS['accueil-ajout'] && app.ACTIONS['af-filtre']);
  assert.ok(app.Accueil.sources.some((s) => s.module === 'accueil-famille'));
});

test('rappels par personne de la fiche d\'un événement : programmés à l\'heure choisie, pour cette personne seulement', () => {
  const maintenant = new Date(2026, 10, 16, 18, 0);
  const debut = new Date(2026, 10, 17, 9, 0);
  const r = A.rappelsPersonnes([
    { evenement_id: 'vaccin', member_id: 'a', minutes: 1440, quand: new Date(2026, 10, 16, 9, 0), debut, titre: 'Vaccin de Zoé' },
    { evenement_id: 'vaccin', member_id: 'm', minutes: 60, quand: new Date(2026, 10, 17, 8, 0), debut, titre: 'Vaccin de Zoé' },
    { evenement_id: 'passe', member_id: 'm', minutes: 60, quand: new Date(2026, 10, 16, 8, 0), debut: new Date(2026, 10, 16, 9, 0), titre: 'Passé' },
  ], maintenant);
  eq(r.map((x) => [x.id, x.pour_membres, x.envoyer_a.getHours(), x.corps, 'evenement_a' in x]), [
    ['evr:vaccin:a:1440:2026-11-17:2026-11-16', ['a'], 9, 'Demain à 9 h', false],
    ['evr:vaccin:m:60:2026-11-17:2026-11-17', ['m'], 8, 'Demain à 9 h', false],
  ]);
  assert.equal(r[0].type, 'evenements');
  assert.equal(+r[0].expire_a, +debut);
});

test('messages et photos : heures de silence par défaut (22 h à 7 h) même sans réglage enregistré', async () => {
  const { couper } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'supabase', 'functions', 'messages-notifier', 'regles.js')).href);
  assert.equal(couper(undefined, {}, 'message', '23:30'), true); // Manon n'a jamais ouvert Plus › Notifications
  assert.equal(couper(undefined, {}, 'message', '06:59'), true);
  assert.equal(couper(undefined, {}, 'message', '07:00'), false);
  assert.equal(couper(undefined, {}, 'photo', '12:00'), false);
  assert.equal(couper({ silence_actif: false }, {}, 'message', '23:30'), false);
  assert.equal(couper({ silence_debut: 21, silence_fin: 6 }, {}, 'message', '21:15'), true);
  assert.equal(couper({ types: { messages: false } }, {}, 'message', '12:00'), true);
  assert.equal(couper(undefined, { messages: false }, 'message', '12:00'), true);
  assert.equal(couper(undefined, { photo: false }, 'photo', '12:00'), true);
  assert.equal(couper({ types: { photo: true } }, { photo: false }, 'photo', '12:00'), false);
  assert.equal(couper(undefined, { silence: { debut: '13:00', fin: '14:00' } }, 'message', '13:30'), true); // ancienne plage d'un appareil
});

test('briefing du soir : la file notif_file le réserve à la personne qui l\'a préparé (séances non partagées)', () => {
  const sql = require('node:fs').readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '2026-11-16_accueil-notifications.sql'), 'utf8');
  const pol = sql.slice(sql.indexOf('create policy "foyer" on public.notif_file'), sql.indexOf('-- 3) Envois déjà faits'));
  assert.match(pol, /using \(foyer_id = \(select mon_foyer\(\)\) and \(type <> 'briefing' or user_id = \(select auth\.uid\(\)\)\)\)/);
  assert.match(pol, /with check \(foyer_id = \(select mon_foyer\(\)\) and \(type <> 'briefing' or user_id = \(select auth\.uid\(\)\)\)\)/);
});
