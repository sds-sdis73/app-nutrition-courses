// Module « Messages et photos » : fonctions pures (discussion, album, gazette).
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

const msg = app.modules.messages;
const ph = app.modules.photos;
const plain = (o) => JSON.parse(JSON.stringify(o));
const eq = (a, b, m) => assert.deepEqual(plain(a), b, m);

test('messages : regroupement par jour, libellés et suites du même auteur', () => {
  const auj = new Date(2026, 9, 21, 12, 5);
  const l = [
    { id: 'c', user_id: 'b', created_at: new Date(2026, 9, 21, 9, 3).toISOString() },
    { id: 'a', user_id: 'a', created_at: new Date(2026, 9, 19, 8, 0).toISOString() },
    { id: 'b', user_id: 'b', created_at: new Date(2026, 9, 21, 9, 0).toISOString() },
    { id: 'd', user_id: 'b', created_at: new Date(2026, 9, 21, 9, 30).toISOString() },
    { id: 'e', user_id: 'a', created_at: new Date(2026, 9, 20, 22, 0).toISOString() },
  ];
  const g = msg.grouperMessages(l, auj);
  eq(g.map((x) => x.libelle), ['lundi 19 octobre', 'Hier', 'Aujourd\'hui']);
  eq(g[2].messages.map((m) => [m.id, m.suite]), [['b', false], ['c', true], ['d', false]]);
  assert.equal(msg.jourLibelle('2025-12-01', auj), 'lundi 1er décembre 2025');
  assert.equal(msg.heureCourte(new Date(2026, 9, 21, 9, 3).toISOString()), '09:03');
});

test('messages : non lus, réactions, lecteurs, aperçu', () => {
  const l = [
    { id: '1', user_id: 'moi', created_at: '2026-10-21T08:00:00Z' },
    { id: '2', user_id: 'manon', created_at: '2026-10-21T09:00:00Z' },
    { id: '3', user_id: 'manon', created_at: '2026-10-21T10:00:00Z' },
  ];
  eq(msg.nonLus(l, 'moi', '2026-10-21T09:00:00Z').map((m) => m.id), ['3']);
  assert.equal(msg.nonLus(l, 'moi', null).length, 2);
  const r = msg.resumeReactions([{ emoji: '❤️', user_id: 'manon' }, { emoji: '😂', user_id: 'moi' }, { emoji: '❤️', user_id: 'moi' }], 'moi');
  eq(r.map((x) => [x.emoji, x.n, x.moi]), [['❤️', 2, true], ['😂', 1, true]]);
  eq(msg.lecteurs(l[0], [{ user_id: 'manon', lu_jusqu_a: '2026-10-21T08:30:00Z' }, { user_id: 'moi', lu_jusqu_a: '2026-10-21T11:00:00Z' }]), ['manon']);
  eq(msg.lecteurs(l[0], [{ user_id: 'manon', lu_jusqu_a: '2026-10-21T07:00:00Z' }]), []);
  assert.equal(msg.apercu({ texte: '' , photo: { chemin: 'x' } }), '📷 Photo');
  assert.equal(msg.apercu({ texte: 'a'.repeat(100) }, 10), `${'a'.repeat(9)}…`);
  assert.equal(msg.listeNoms(['Antoine', 'Manon', 'Zoé']), 'Antoine, Manon et Zoé');
  assert.equal(msg.listeNoms(['Manon']), 'Manon');
});

test('photos : taille réduite et qualité JPEG', () => {
  eq(ph.dimensions(4032, 3024, 1600), { l: 1600, h: 1200 });
  eq(ph.dimensions(3024, 4032, 1600), { l: 1200, h: 1600 });
  eq(ph.dimensions(800, 600, 1600), { l: 800, h: 600 }, 'jamais agrandie');
  assert.equal(ph.qualiteSuivante(900000, 300000, 0.85), 0.7);
  assert.equal(ph.qualiteSuivante(400000, 300000, 0.85), 0.78);
  assert.equal(ph.qualiteSuivante(400000, 300000, 0.5), 0.45);
  assert.equal(ph.cheminFichier('f1', 'album', 'p1', true), 'f1/album/p1-mini.jpg');
});

test('photos : liens d\'albums partagés', () => {
  assert.equal(ph.fournisseurLien('https://photos.app.goo.gl/AbC123'), 'google');
  assert.equal(ph.fournisseurLien('https://www.icloud.com/sharedalbum/#B0aG'), 'icloud');
  assert.equal(ph.fournisseurLien('https://exemple.fr/album'), 'autre');
  assert.equal(ph.fournisseurLien('http://photos.app.goo.gl/x'), null, 'https obligatoire');
  assert.equal(ph.fournisseurLien('javascript:alert(1)'), null);
  assert.equal(ph.fournisseurLien(''), null);
});

test('gazette : mois, âges, numéros, nouvelles proposées', () => {
  assert.equal(ph.moisDecale('2026-01', -1), '2025-12');
  assert.equal(ph.moisDecale('2026-11', 2), '2027-01');
  assert.equal(ph.moisLibelle('2026-08'), 'août 2026');
  assert.equal(ph.deMois('2026-10'), 'd\'octobre');
  assert.equal(ph.deMois('2026-08'), 'd\'août');
  assert.equal(ph.deMois('2026-11'), 'de novembre');
  const nov = new Date(2026, 10, 30);
  assert.equal(ph.ageTexte('2025-04-11', nov), '1 an et 7 mois');
  assert.equal(ph.ageTexte('2025-04-11', new Date(2025, 9, 30)), '6 mois');
  assert.equal(ph.ageTexte('2026-11-20', nov), 'moins d\'un mois');
  assert.equal(ph.ageTexte('1991-02-01', nov), '35 ans');
  assert.equal(ph.ageTexte('2023-04-11', nov), '3 ans');
  assert.equal(ph.numeroGazette('2026-11', []), 1);
  assert.equal(ph.numeroGazette('2027-02', ['2026-11', '2026-12']), 4);
  eq(ph.lignesNouvelles('• Zoé marche\n\n- Les toutous ont vu la neige\n  '), ['Zoé marche', 'Les toutous ont vu la neige']);
  const photos = [{ id: 'p1', prise_le: '2026-11-03' }, { id: 'p2', prise_le: '2026-11-20' }, { id: 'p3', prise_le: '2026-10-31' }];
  const n = ph.nouvellesSuggerees({ mois: '2026-11', photos, messages: [{ created_at: '2026-11-02T10:00:00Z' }], membres: [{ nom: 'Zoé', naissance: '2025-04-11' }, { nom: 'Antoine', naissance: '1991-02-01' }] });
  eq(n, ['Zoé a 1 an et 7 mois.', '2 photos ajoutées à l\'album ce mois-ci.', '1 message échangé dans la discussion de la famille.']);
});

test('gazette : choix des photos par défaut et page imprimable', () => {
  const photos = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, prise_le: `2026-11-${String(i + 1).padStart(2, '0')}`, chemin: `f/album/p${i}.jpg`, legende: i === 11 ? 'Neige !' : null }));
  const c = ph.choixGazette(photos, '2026-11', 6);
  assert.equal(c.length, 6);
  assert.ok(c.includes('p11'), 'la photo légendée est retenue');
  eq(c, [...c].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), 'ordre chronologique');
  eq(ph.choixGazette(photos.slice(0, 2), '2026-11'), ['p0', 'p1']);
  eq(ph.photosDuMois(photos, '2026-10'), []);
  const html = ph.gazetteHtml({ mois: '2026-11', titre: 'La Gazette <Tribu>', mot: 'Bonjour Mamie', nouvelles: '• Zoé marche', photos: ['p11', 'p0'] },
    { photos, urls: { 'f/album/p11.jpg': 'https://x/p11' }, numero: 3, foyerNom: 'Les Toutous', signature: 'Antoine et Manon', famille: 'Antoine, Manon, Zoé et les toutous' });
  assert.match(html, /La Gazette &lt;Tribu&gt;/, 'texte échappé');
  assert.match(html, /N° 3/);
  assert.match(html, /novembre 2026 · Les Toutous/);
  assert.match(html, /data-n="2"/);
  assert.match(html, /<img src="https:\/\/x\/p11" alt="Neige !">/);
  assert.match(html, /mp-gz-vide/, 'photo sans adresse : cadre vide');
  assert.match(html, /12 novembre 2026/);
  assert.match(html, /<li>Zoé marche<\/li>/);
  assert.match(html, /Antoine et Manon/);
  assert.doesNotMatch(ph.gazetteHtml({ mois: '2026-11', photos: [] }, {}), /mp-gz-photos|mp-gz-mot|mp-gz-nouvelles/);
});

test('module : deux écrans dans Famille, tables, notifications', () => {
  assert.equal(app.Modules.get('messages').onglet, 'famille');
  assert.equal(app.Modules.get('photos').onglet, 'famille');
  assert.equal(app.T.mp_messages, 'messages_famille');
  assert.equal(app.T.mp_gazettes, 'photos_gazettes');
  const types = app.Modules.notifications().map((n) => n.type);
  assert.ok(types.includes('messages') && types.includes('photo'));
});
