// Registre des modules, navigation à 5 onglets, points d'extension (Accueil, Agenda, bouton « + ») et analyse de phrase.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');
const { modules: fichiersModules } = require('../../tools/assemble.js');

const plain = (o) => JSON.parse(JSON.stringify(o));

describe('registre des modules', () => {
  test('tous les modules de src/js/modules/ sont chargés et enregistrés sous leur nom de fichier', () => {
    for (const id of fichiersModules()) assert.ok(app.Modules.get(id), `module ${id} absent du registre`);
  });
  test('5 onglets, dans l\'ordre Accueil · Famille · Cuisine · Forme · Plus', () => {
    assert.deepEqual(plain(app.ONGLETS.map((o) => o.id)), ['accueil', 'famille', 'cuisine', 'forme', 'plus']);
  });
  test('segments de chaque onglet', () => {
    const seg = (o) => plain(app.Modules.vues(o).map((m) => m.id));
    assert.deepEqual(seg('accueil'), ['aujourdhui', 'accueil-famille', 'suivi']);
    assert.deepEqual(seg('famille'), ['agenda', 'taches', 'messages', 'photos', 'carnet']);
    assert.deepEqual(seg('cuisine'), ['planning', 'courses', 'recettes', 'batch', 'scan']);
    assert.deepEqual(seg('forme'), ['forme']);
    assert.deepEqual(seg('plus'), ['reglages', 'univers', 'notifications', 'agenda-synchro', 'monsieur-cuisine', 'securite', 'sauvegarde', 'widget']);
  });
  test('chaque écran a un rendu ou une action d\'ouverture', () => {
    for (const m of app.Modules.liste) assert.ok(m.rendu || m.ouvrir, `${m.id} sans rendu ni ouvrir`);
  });
  test('résolution d\'un onglet vers un écran ; écran inconnu → Ma journée', () => {
    assert.equal(app.Nav.resoudre('cuisine'), 'planning');
    assert.equal(app.Nav.resoudre('famille'), 'agenda');
    assert.equal(app.Nav.resoudre('plus'), 'plus');
    assert.equal(app.Nav.resoudre('batch'), 'batch');
    assert.equal(app.Nav.resoudre('nimporte'), 'aujourdhui');
  });
  test('batch masquable : masqué, il disparaît des segments et l\'onglet retombe sur Repas', () => {
    app.Modules.masquer('batch', true);
    try {
      assert.ok(!app.Modules.vues('cuisine').some((m) => m.id === 'batch'));
      assert.equal(app.Nav.resoudre('batch'), 'aujourdhui');
    } finally { app.Modules.masquer('batch', false); }
    assert.ok(app.Modules.vues('cuisine').some((m) => m.id === 'batch'));
  });
  test('enregistrement refusé : doublon, onglet inconnu, champ inconnu, action déjà prise', () => {
    assert.throws(() => app.Modules.register({ id: 'agenda', onglet: 'famille', rendu: () => '' }), /deux fois/);
    assert.throws(() => app.Modules.register({ id: 'essai-x', onglet: 'jardin', rendu: () => '' }), /onglet inconnu/);
    assert.throws(() => app.Modules.register({ id: 'essai-y', onglet: 'plus', rendu: () => '', render: () => '' }), /champ\(s\) inconnu/);
    assert.throws(() => app.Modules.register({ id: 'essai-z', onglet: 'plus', rendu: () => '', actions: { tab: () => {} } }), /déjà définie/);
  });
  test('un module enregistre ses actions, ses tables, ses sources et ses exposes', async () => {
    const m = app.Modules.register({
      id: 'essai-complet', onglet: 'famille', segment: 'Essai', ordre: 99, rendu: () => '<p>essai</p>',
      actions: { 'essai-act': () => 'ok' }, tables: { essai_table: 'essai_table' }, expose: { double: (x) => 2 * x },
      sourcesAccueil: () => [{ heure: '08:00', titre: 'Petit-déjeuner essai' }],
      agenda: () => [{ id: 'e1', date: '2026-10-22', heure: '14:00', titre: 'Judo' }, { id: 'e0', date: '2030-01-01', titre: 'Hors période' }],
      notifications: [{ type: 'essai', libelle: 'Rappel d\'essai' }],
    });
    assert.equal(app.ACTIONS['essai-act'](), 'ok');
    assert.equal(app.T.essai_table, 'essai_table');
    assert.equal(app.Modules.exposes()['essai-complet'].double(4), 8);
    assert.ok(app.Modules.notifications().some((n) => n.module === 'essai-complet' && n.type === 'essai' && n.defaut === true));
    const fil = await app.Accueil.elements({ date: app.isoToDate('2026-10-21') });
    assert.ok(fil.some((e) => e.titre === 'Petit-déjeuner essai' && e.module === m.id));
    const ag = await app.Agenda.elements(app.isoToDate('2026-10-19'), app.isoToDate('2026-10-25'));
    assert.deepEqual(plain(ag.filter((e) => e.source === 'essai-complet').map((e) => e.id)), ['e1']);
  });
  test('une source qui échoue n\'empêche pas les autres', async () => {
    app.Accueil.sources.push({ module: 'casse', fn: () => { throw new Error('boum'); } });
    const warn = console.warn; console.warn = () => {};
    try { assert.ok(Array.isArray(await app.Accueil.elements({}))); } finally { console.warn = warn; app.Accueil.sources.pop(); }
  });
});

describe('analyse de phrase libre', () => {
  const maintenant = new Date(2026, 9, 21, 12, 5); // mercredi 21 octobre 2026
  const membres = [{ id: 'z', nom: 'Zoé' }, { id: 'a', nom: 'Antoine' }, { id: 'm', nom: 'Manon' }];
  const a = (t) => plain(app.analysePhrase(t, { maintenant, membres }));
  test('« judo Zoé mercredi 14 h » : aujourd\'hui (mercredi), 14:00, Zoé', () => {
    assert.deepEqual(a('judo Zoé mercredi 14 h'), { date: '2026-10-21', heure: '14:00', membres: ['z'], texte: 'judo' });
  });
  test('demain, après-demain, jour de la semaine, « prochain »', () => {
    assert.equal(a('dentiste demain 9h30').date, '2026-10-22');
    assert.equal(a('dentiste demain 9h30').heure, '09:30');
    assert.equal(a('piscine après-demain').date, '2026-10-23');
    assert.equal(a('marché samedi').date, '2026-10-24');
    assert.equal(a('réunion mercredi prochain').date, '2026-10-28');
  });
  test('dates écrites : 12/11, le 3 novembre, 1er janvier (année suivante si passé)', () => {
    assert.equal(a('vaccin 12/11').date, '2026-11-12');
    assert.equal(a('anniversaire le 3 novembre').date, '2026-11-03');
    assert.equal(a('fête 1er janvier').date, '2027-01-01');
  });
  test('ce soir, plusieurs membres, texte restant', () => {
    const r = a('ciné ce soir avec Manon et Antoine');
    assert.equal(r.date, '2026-10-21');
    assert.equal(r.heure, '19:00');
    assert.deepEqual(r.membres.sort(), ['a', 'm']);
    assert.equal(r.texte, 'ciné et');
  });
  test('sans date ni heure', () => {
    assert.deepEqual(a('sortir les poubelles'), { date: null, heure: null, membres: [], texte: 'sortir les poubelles' });
  });
});

describe('bouton « + » : analyseurs', () => {
  test('les 5 types sont proposés dans l\'ordre événement, tâche, article, repas, séance', () => {
    assert.deepEqual(plain(app.AjoutRapide.TYPES.map(([t]) => t)), ['evenement', 'tache', 'article', 'repas', 'seance']);
  });
  test('articles de courses : verbe, quantités, déterminants', () => {
    const r = plain(app.analyseArticles('acheter du lait, 6 œufs et de la farine'));
    assert.equal(r.verbe, true);
    assert.deepEqual(r.items, [{ nom: 'Lait', qte: '' }, { nom: 'Œufs', qte: '6' }, { nom: 'Farine', qte: '' }]);
  });
  test('articles : un mot qui commence comme un article (lait, levure, lessive, lentilles, dentifrice) reste entier', () => {
    const noms = (t) => plain(app.analyseArticles(t)).items.map((a) => (a.qte ? `${a.qte} ${a.nom}` : a.nom));
    assert.deepEqual(noms('acheter lait, levure et dentifrice'), ['Lait', 'Levure', 'Dentifrice']);
    assert.deepEqual(noms('acheter lessive'), ['Lessive']);
    assert.deepEqual(noms('racheter lentilles'), ['Lentilles']);
    assert.deepEqual(noms('acheter 2 l lait'), ['2 l Lait']);
    assert.deepEqual(noms('lait, œufs, pain'), ['Lait', 'Œufs', 'Pain']);
    assert.deepEqual(noms('acheter de l\'huile, l’eau, d\'abricots et les lardons'), ['Huile', 'Eau', 'Abricots', 'Lardons']);
    assert.deepEqual(noms('dentiste Julie jeudi'), ['Dentiste Julie jeudi']);
  });
  test('« acheter du pain » est d\'abord un article ; « 30 min de course » d\'abord une séance', () => {
    const ctx = { maintenant: new Date(2026, 9, 21), membres: [] };
    assert.equal(app.AjoutRapide.analyser('acheter du pain', ctx)[0].type, 'article');
    assert.equal(app.AjoutRapide.analyser('30 min de course à pied', ctx)[0].type, 'seance');
    assert.equal(app.AjoutRapide.analyser('j\'ai mangé une pomme', ctx)[0].type, 'repas');
    assert.equal(app.AjoutRapide.analyser('   ', ctx).length, 0);
  });
  test('un analyseur sans ouvrir() ou de type inconnu est refusé', () => {
    assert.throws(() => app.AjoutRapide.ajouter({ type: 'article', analyser: () => null }), /ouvrir/);
    assert.throws(() => app.AjoutRapide.ajouter({ type: 'courrier', ouvrir: () => {} }), /type inconnu/);
  });
});
