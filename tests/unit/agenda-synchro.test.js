// Synchronisation des agendas : générateur et analyseur iCalendar (supabase/functions/_shared/ics.js),
// lecture CalDAV et plan de synchro iCloud (_shared/caldav.js), aides du module client agenda-synchro.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const app = require('./_app');

const partage = (f) => import(pathToFileURL(path.join(__dirname, '..', '..', 'supabase', 'functions', '_shared', f)).href);
const CRLF = '\r\n';
const cal = (...lignes) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//FR', ...lignes, 'END:VCALENDAR'].join(CRLF);

test('ICS : échappement du texte et pliage des lignes à 75 octets', async () => {
  const I = await partage('ics.js');
  assert.equal(I.echapper('Goûter, jeux; fin\\ici\nsuite'), 'Goûter\\, jeux\\; fin\\\\ici\\nsuite');
  assert.equal(I.desechapper('Goûter\\, jeux\\; fin\\\\ici\\nsuite\\N2'), 'Goûter, jeux; fin\\ici\nsuite\n2');
  const longue = `SUMMARY:${'Réunion de l\'école maternelle à Échirolles, très importante '.repeat(4)}`;
  const pliee = I.plier(longue);
  for (const l of pliee.split(CRLF)) assert.ok(Buffer.byteLength(l, 'utf8') <= 75, `ligne trop longue : ${l}`);
  assert.ok(pliee.split(CRLF).slice(1).every((l) => l.startsWith(' ')));
  assert.equal(I.deplier(pliee), longue);
  // Un emoji (4 octets) n'est jamais coupé en deux.
  const emo = I.plier(`DESCRIPTION:${'🐶'.repeat(40)}`);
  assert.equal(I.deplier(emo), `DESCRIPTION:${'🐶'.repeat(40)}`);
  assert.ok(!emo.includes('�'));
});

test('ICS : fuseau Europe/Paris, heure d\'été et d\'hiver, noms Windows et TZID inconnus', async () => {
  const I = await partage('ics.js');
  assert.equal(I.instantDe(2026, 7, 1, 9, 0, 0).toISOString(), '2026-07-01T07:00:00.000Z');
  assert.equal(I.instantDe(2026, 12, 1, 9, 0, 0).toISOString(), '2026-12-01T08:00:00.000Z');
  assert.equal(I.instantDe(2026, 10, 25, 1, 30, 0).toISOString(), '2026-10-24T23:30:00.000Z'); // la nuit du passage à l'heure d'hiver
  assert.equal(I.fuseau('Romance Standard Time'), 'Europe/Paris');
  assert.equal(I.fuseau('/mozilla.org/20050126_1/Europe/Paris'), 'Europe/Paris');
  assert.equal(I.fuseau('Fuseau/Inconnu'), 'Europe/Paris');
  assert.equal(I.fuseau('America/New_York'), 'America/New_York');
  assert.equal(I.jourParis('2026-11-17T23:30:00Z'), '2026-11-18');
  assert.equal(I.duree('PT1H30M'), 5400000);
  assert.equal(I.duree('P1W'), 7 * 86400000);
  assert.equal(I.duree('-PT15M'), -900000);
});

test('ICS : RRULE ↔ récurrence de l\'agenda', async () => {
  const I = await partage('ics.js');
  assert.equal(I.versRRule({ freq: 'hebdo', jours: [3, 1], intervalle: 2 }), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE');
  assert.equal(I.versRRule({ freq: 'mensuelle', nombre: 6 }), 'FREQ=MONTHLY;COUNT=6');
  assert.equal(I.versRRule({ freq: 'annuelle', jusqu: '2030-04-11' }, { journee: true }), 'FREQ=YEARLY;UNTIL=20300411');
  assert.equal(I.versRRule({ freq: 'quotidienne', jusqu: '2026-12-20' }), 'FREQ=DAILY;UNTIL=20261220T225959Z');
  assert.deepEqual(I.depuisRRule('RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261219T225959Z'), { freq: 'hebdo', jours: [2, 4], jusqu: '2026-12-19' });
  assert.deepEqual(I.depuisRRule('FREQ=DAILY;INTERVAL=15;COUNT=4'), { freq: 'quotidienne', intervalle: 15, nombre: 4 });
  assert.equal(I.depuisRRule('FREQ=MONTHLY;BYDAY=2TU').nonGere, true); // « 2e mardi du mois »
  const d0 = { journee: true, date: '2026-03-14' };
  assert.equal(I.depuisRRule('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=14', d0).nonGere, undefined);
  assert.equal(I.depuisRRule('FREQ=SECONDLY'), null);
});

test('ICS : génération d\'un calendrier (heures de Paris, journées entières, exceptions, membres)', async () => {
  const I = await partage('ics.js');
  const judo = { id: '11111111-2222-4333-8444-555555555555', titre: 'Judo, cours; débutants', categorie: 'activite', debut: '2026-11-18T13:00:00Z', fin: '2026-11-18T14:00:00Z',
    journee: false, lieu: 'Gymnase de Meylan', notes: 'Kimono\nCeinture', membres: ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'], recurrence: { freq: 'hebdo', jours: [3] }, exceptions: ['2026-12-23'], updated_at: '2026-11-15T10:00:00Z' };
  const vacances = { id: '99999999-2222-4333-8444-555555555555', titre: 'Vacances à la mer', debut: '2026-12-18T23:00:00Z', fin: '2026-12-25T23:00:00Z', journee: true, membres: [], exceptions: [] };
  const texte = I.calendrier([I.vevent(judo, { noms: { 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee': 'Zoé' }, maintenant: new Date('2026-11-15T12:00:00Z') }), I.vevent(vacances)], { nom: 'Tribu & Toutous' });
  assert.ok(texte.endsWith(CRLF));
  assert.ok(!/[^\r]\n/.test(texte), 'fins de ligne CRLF');
  const l = I.deplier(texte).split('\n');
  for (const attendu of ['METHOD:PUBLISH', 'X-WR-CALNAME:Tribu & Toutous', 'TZID:Europe/Paris', 'UID:11111111-2222-4333-8444-555555555555@tribu-et-toutous',
    'DTSTAMP:20261115T120000Z', 'DTSTART;TZID=Europe/Paris:20261118T140000', 'DTEND;TZID=Europe/Paris:20261118T150000', 'SUMMARY:Judo\\, cours\\; débutants',
    'DESCRIPTION:Kimono\\nCeinture\\n\\nPour : Zoé', 'RRULE:FREQ=WEEKLY;BYDAY=WE', 'EXDATE;TZID=Europe/Paris:20261223T140000', 'X-TT-CATEGORIE:activite',
    'DTSTART;VALUE=DATE:20261219', 'DTEND;VALUE=DATE:20261227']) assert.ok(l.includes(attendu), `ligne manquante : ${attendu}`);
  // Sans METHOD pour CalDAV.
  assert.ok(!I.calendrier([], { methode: false }).includes('METHOD:'));
});

test('ICS : aller-retour génération → analyse sans perte', async () => {
  const I = await partage('ics.js');
  const ev = { id: '11111111-2222-4333-8444-555555555555', titre: 'Piscine', categorie: 'activite', debut: '2026-07-07T16:00:00.000Z', fin: '2026-07-07T17:15:00.000Z', journee: false,
    lieu: 'Piscine, Grenoble', notes: null, membres: ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'], recurrence: { freq: 'hebdo', jours: [2], jusqu: '2026-08-25' }, exceptions: ['2026-07-14'] };
  const fete = { id: '22222222-2222-4333-8444-555555555555', titre: 'Anniversaire de Zoé', categorie: 'anniversaire', debut: '2026-04-10T22:00:00.000Z', fin: '2026-04-10T22:00:00.000Z', journee: true, membres: [], recurrence: { freq: 'annuelle' }, exceptions: [] };
  const { evenements } = I.analyserIcs(I.calendrier([I.vevent(ev), I.vevent(fete)]));
  const [a, b] = evenements;
  assert.equal(a.uid, '11111111-2222-4333-8444-555555555555@tribu-et-toutous');
  for (const k of ['titre', 'categorie', 'debut', 'fin', 'journee', 'lieu', 'membres', 'recurrence', 'exceptions']) assert.deepEqual(a[k], ev[k], k);
  for (const k of ['titre', 'categorie', 'debut', 'fin', 'journee', 'recurrence']) assert.deepEqual(b[k], fete[k], k);
});

test('ICS : analyse d\'agendas Google, Outlook et iCloud', async () => {
  const I = await partage('ics.js');
  const texte = cal(
    'X-WR-CALNAME:Travail', 'X-WR-TIMEZONE:Europe/Paris',
    'BEGIN:VEVENT', 'UID:g1@google.com', 'DTSTART:20261118T080000Z', 'DTEND:20261118T093000Z', 'SUMMARY:Réunion\\, équipe', 'LOCATION:Salle 2\\; bât. B',
    'DESCRIPTION:Ordre du jour :\\n1. budget\\n2. planning avec une très longue description qui doit être pliée sur plusieurs lig', ' nes', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:o1', 'DTSTART;TZID=Romance Standard Time:20260702T090000', 'DURATION:PT45M', 'SUMMARY:Dentiste', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:i1', 'DTSTART;VALUE=DATE:20261221', 'DTEND;VALUE=DATE:20261224', 'SUMMARY:Ski', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:r1', 'DTSTART;TZID=Europe/Paris:20261102T183000', 'DTEND;TZID=Europe/Paris:20261102T193000', 'RRULE:FREQ=WEEKLY;BYDAY=MO',
    'EXDATE;TZID=Europe/Paris:20261109T183000,20261116T183000', 'SUMMARY:Yoga', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:r1', 'RECURRENCE-ID;TZID=Europe/Paris:20261123T183000', 'DTSTART;TZID=Europe/Paris:20261124T190000', 'DTEND;TZID=Europe/Paris:20261124T200000', 'SUMMARY:Yoga (décalé)', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:r1', 'RECURRENCE-ID;TZID=Europe/Paris:20261130T183000', 'STATUS:CANCELLED', 'DTSTART;TZID=Europe/Paris:20261130T183000', 'SUMMARY:Yoga', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:x1', 'STATUS:CANCELLED', 'DTSTART:20261201T100000Z', 'SUMMARY:Annulé', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:f1', 'DTSTART:20261203T100000', 'SUMMARY:Heure flottante', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:vieux', 'DTSTART:20200101T100000Z', 'SUMMARY:Il y a longtemps', 'END:VEVENT');
  const r = I.analyserIcs(texte, { fenetre: { depuis: new Date('2025-11-15T00:00:00Z') } });
  assert.equal(r.nom, 'Travail');
  const par = Object.fromEntries(r.evenements.map((e) => [e.cle, e]));
  assert.deepEqual(Object.keys(par).sort(), ['f1', 'g1@google.com', 'i1', 'o1', 'r1', 'r1#2026-11-23T17:30:00.000Z'].sort());
  assert.equal(par['g1@google.com'].titre, 'Réunion, équipe');
  assert.equal(par['g1@google.com'].lieu, 'Salle 2; bât. B');
  assert.match(par['g1@google.com'].notes, /1\. budget\n2\. planning .* plusieurs lignes$/);
  assert.equal(par.o1.debut, '2026-07-02T07:00:00.000Z'); // 9 h, heure d'été de Paris (nom Windows d'Outlook)
  assert.equal(par.o1.fin, '2026-07-02T07:45:00.000Z');
  assert.equal(par.i1.journee, true);
  assert.equal(par.i1.debut, '2026-12-20T23:00:00.000Z'); // minuit à Paris
  assert.equal(par.i1.fin, '2026-12-22T23:00:00.000Z'); // dernier jour inclus (DTEND exclusif)
  assert.deepEqual(par.r1.recurrence, { freq: 'hebdo', jours: [1] });
  assert.deepEqual(par.r1.exceptions, ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']); // EXDATE + occurrences modifiées ou annulées
  assert.equal(par['r1#2026-11-23T17:30:00.000Z'].titre, 'Yoga (décalé)');
  assert.equal(par.f1.debut, '2026-12-03T09:00:00.000Z'); // heure flottante lue à l'heure de l'agenda (Paris)
  assert.throws(() => I.analyserIcs('<html>Connexion</html>'), /iCalendar/);
});

test('ICS : fusion avec la version iCloud (les alarmes et invités sont gardés)', async () => {
  const I = await partage('ics.js');
  const distant = cal('BEGIN:VEVENT', 'UID:abc@icloud', 'DTSTART;TZID=Europe/Paris:20261118T090000', 'SUMMARY:Ancien titre', 'ATTENDEE;CN=Manon:mailto:manon@example.fr',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT');
  const ev = { id: 'x', source: 'icloud', source_uid: 'abc@icloud', titre: 'Nouveau titre', debut: '2026-11-18T09:00:00Z', fin: '2026-11-18T10:00:00Z', journee: false, membres: [], exceptions: [] };
  const sortie = I.deplier(I.ressource([ev], { distant }));
  assert.match(sortie, /SUMMARY:Nouveau titre/);
  assert.doesNotMatch(sortie, /Ancien titre/);
  assert.match(sortie, /UID:abc@icloud/);
  assert.match(sortie, /ATTENDEE;CN=Manon:mailto:manon@example.fr/);
  assert.match(sortie, /BEGIN:VALARM\r?\nACTION:DISPLAY\r?\nTRIGGER:-PT15M\r?\nEND:VALARM/);
  assert.match(sortie, /DTSTART;TZID=Europe\/Paris:20261118T100000/);
});

const MULTI = `<?xml version="1.0"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
 <response><href>/123/calendars/famille/</href><propstat><prop><displayname>Famille &amp; amis</displayname><resourcetype><collection/><C:calendar/></resourcetype>
  <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set><calendar-color xmlns="http://apple.com/ns/ical/">#FF2968FF</calendar-color></prop><status>HTTP/1.1 200 OK</status></propstat>
  <propstat><prop><getctag/></prop><status>HTTP/1.1 404 Not Found</status></propstat></response>
 <response><href>/123/calendars/rappels/</href><propstat><prop><displayname>Rappels</displayname><resourcetype><collection/><C:calendar/></resourcetype>
  <C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set></prop><status>HTTP/1.1 200 OK</status></propstat></response>
 <response><href>/123/calendars/</href><propstat><prop><displayname>Dossier</displayname><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response>
</multistatus>`;

test('CalDAV : réponses multistatus, calendriers, ressources, en-tête Basic', async () => {
  const C = await partage('caldav.js');
  const base = 'https://p42-caldav.icloud.com/123/calendars/';
  assert.deepEqual(C.calendriers(MULTI, base), [{ url: 'https://p42-caldav.icloud.com/123/calendars/famille/', nom: 'Famille & amis', couleur: '#FF2968FF', ctag: null }]);
  const principal = '<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>';
  assert.equal(C.hrefDe(principal, 'current-user-principal', 'https://caldav.icloud.com/'), 'https://caldav.icloud.com/123/principal/');
  const rapport = `<D:multistatus xmlns:D="DAV:" xmlns:CAL="urn:ietf:params:xml:ns:caldav"><D:response><D:href>/123/calendars/famille/a.ics</D:href><D:propstat><D:prop>
    <D:getetag>"e1"</D:getetag><CAL:calendar-data><![CDATA[BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Pâtes & salade <3\r\nDTSTART:20261118T080000Z\r\nEND:VEVENT\r\nEND:VCALENDAR]]></CAL:calendar-data>
    </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response><D:response><D:href>/123/calendars/famille/b.ics</D:href><D:propstat><D:prop><D:getetag>&quot;e2&quot;</D:getetag>
    <CAL:calendar-data>BEGIN:VCALENDAR&#13;\nBEGIN:VEVENT&#13;\nUID:b&#13;\nSUMMARY:A &amp; B&#13;\nDTSTART:20261119T080000Z&#13;\nEND:VEVENT&#13;\nEND:VCALENDAR</CAL:calendar-data></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`;
  const res = C.ressources(rapport, base);
  assert.deepEqual(res.map((r) => [r.href, r.etag]), [['https://p42-caldav.icloud.com/123/calendars/famille/a.ics', '"e1"'], ['https://p42-caldav.icloud.com/123/calendars/famille/b.ics', '"e2"']]);
  assert.match(res[0].ics, /SUMMARY:Pâtes & salade <3/);
  assert.match(res[1].ics, /SUMMARY:A & B/);
  assert.equal(C.basic('zoé@icloud.com', 'abcd-efgh-ijkl-mnop'), `Basic ${Buffer.from('zoé@icloud.com:abcd-efgh-ijkl-mnop').toString('base64')}`);
  assert.ok(C.motDePasseAppValide('abcd-efgh-ijkl-mnop') && C.motDePasseAppValide('ABCDEFGHIJKLMNOP'));
  assert.ok(!C.motDePasseAppValide('MonMotDePasse1!'));
  assert.match(C.corpsRequete(new Date('2026-08-17T00:00:00Z'), new Date('2028-11-15T00:00:00Z')), /time-range start="20260817T000000Z" end="20281115T000000Z"/);
});

test('CalDAV : plan de synchro dans les deux sens', async () => {
  const C = await partage('caldav.js');
  const I = await partage('ics.js');
  const calUrl = 'https://p42-caldav.icloud.com/123/calendars/famille/';
  const ics = (uid, titre, extra = []) => I.calendrier([['BEGIN:VEVENT', `UID:${uid}`, 'DTSTART:20261118T080000Z', 'DTEND:20261118T090000Z', `SUMMARY:${titre}`, ...extra, 'END:VEVENT'].join(CRLF)], { methode: false });
  const appli = { id: '11111111-2222-4333-8444-555555555555', titre: 'Judo', debut: '2026-11-20T16:00:00Z', fin: '2026-11-20T17:00:00Z', journee: false, membres: [], exceptions: [], recurrence: null, source: null, source_uid: null };
  const vieux = { ...appli, id: '33333333-2222-4333-8444-555555555555', debut: '2025-01-01T10:00:00Z', fin: '2025-01-01T11:00:00Z' };
  let n = 0;
  const base = { calendrier: calUrl, depuis: new Date('2026-08-17T00:00:00Z'), nouvelId: () => `nouveau-${++n}`, maintenant: new Date('2026-11-15T12:00:00Z') };

  // 1) Première synchro : un événement iCloud arrive, celui de l'appli part (le vieux reste hors fenêtre).
  const p1 = C.planSynchro({ ...base, distants: [{ href: `${calUrl}x.ics`, etag: '"1"', ics: ics('x@icloud', 'Dentiste') }], liens: [], locaux: [appli, vieux] });
  assert.equal(p1.creer.length, 1);
  assert.deepEqual([p1.creer[0].titre, p1.creer[0].source, p1.creer[0].source_uid], ['Dentiste', 'icloud', 'x@icloud']);
  assert.equal(p1.envoyer.length, 1);
  assert.equal(p1.envoyer[0].href, `${calUrl}11111111-2222-4333-8444-555555555555.ics`);
  assert.equal(p1.envoyer[0].etag, null); // création : If-None-Match
  assert.match(p1.envoyer[0].ics, /UID:11111111-2222-4333-8444-555555555555@tribu-et-toutous/);
  assert.deepEqual(p1.liens.map((l) => l.evenement_ids), [['nouveau-1']]);

  // 2) Synchro suivante : rien n'a changé → rien à faire.
  const dentiste = { ...p1.creer[0] };
  const liens = [p1.liens[0], { ...p1.envoyer[0].lien, etag: '"a1"' }];
  const distants = [{ href: `${calUrl}x.ics`, etag: '"1"', ics: ics('x@icloud', 'Dentiste') }, { href: p1.envoyer[0].href, etag: '"a1"', ics: p1.envoyer[0].ics }];
  const p2 = C.planSynchro({ ...base, distants, liens, locaux: [appli, dentiste] });
  assert.deepEqual([p2.creer.length, p2.maj.length, p2.supprimer.length, p2.envoyer.length, p2.effacer.length], [0, 0, 0, 0, 0]);

  // 3) Modifié dans l'appli (iCloud inchangé) → envoyé avec If-Match ; modifié dans iCloud → repris ici.
  const p3 = C.planSynchro({ ...base, distants: [{ ...distants[0], etag: '"2"', ics: ics('x@icloud', 'Dentiste Zoé') }, distants[1]], liens, locaux: [{ ...appli, titre: 'Judo (gymnase)' }, dentiste] });
  assert.deepEqual(p3.envoyer.map((e) => [e.etag, /SUMMARY:Judo \(gymnase\)/.test(e.ics)]), [['"a1"', true]]);
  assert.deepEqual(p3.maj.map((m) => [m.id, m.titre]), [['nouveau-1', 'Dentiste Zoé']]);

  // 4) Supprimé dans iCloud → supprimé ici ; supprimé dans l'appli → effacé sur iCloud.
  const p4 = C.planSynchro({ ...base, distants: [distants[1]], liens, locaux: [dentiste] });
  assert.deepEqual(p4.supprimer, ['nouveau-1']);
  assert.deepEqual(p4.effacer, [{ href: p1.envoyer[0].href, etag: '"a1"' }]);
  assert.deepEqual(p4.oublier.sort(), [`${calUrl}x.ics`, p1.envoyer[0].href].sort());

  // 5) Lien perdu (iCloud délié puis relié) : l'événement de l'appli et l'événement iCloud déjà reçus sont retrouvés, sans doublon.
  const p5 = C.planSynchro({ ...base, distants, liens: [], locaux: [appli, dentiste] });
  assert.equal(p5.creer.length, 0);
  assert.deepEqual(p5.maj.map((m) => m.id).sort(), [appli.id, 'nouveau-1'].sort());
  assert.equal(p5.envoyer.length, 0);

  // 6) L'empreinte ignore l'ordre des clés rendu par jsonb.
  assert.equal(C.empreinte([{ ...appli, recurrence: { freq: 'hebdo', jours: [1] } }]), C.empreinte([{ ...appli, recurrence: { jours: [1], freq: 'hebdo' } }]));
});

test('module agenda-synchro : liens, adresses, éléments d\'agenda importés', () => {
  const S = app.modules['agenda-synchro'];
  const J = (x) => JSON.parse(JSON.stringify(x)); // tableaux du bac à sable → tableaux de ce contexte
  const A = app.modules.agenda;
  assert.equal(S.normaliserUrl(' webcal://p42-caldav.icloud.com/published/2/abc '), 'https://p42-caldav.icloud.com/published/2/abc');
  assert.equal(S.normaliserUrl('ftp://exemple.fr/a.ics'), null);
  assert.equal(S.normaliserUrl('pas une adresse'), null);
  assert.match(S.lienWebcal('abc_DEF-123'), /^webcal:\/\/svugddkrptqpjmywhorb\.supabase\.co\/functions\/v1\/agenda-ics\?t=abc_DEF-123$/);
  assert.equal(S.lienWebcal(null), '');
  const j = S.nouveauJeton();
  assert.match(j, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(j, S.nouveauJeton());
  assert.equal(S.serviceDe('https://calendar.google.com/calendar/ical/x/basic.ics'), 'Google Agenda');
  assert.equal(S.serviceDe('webcal://p42-caldav.icloud.com/published/2/x'), 'iCloud');
  assert.equal(S.serviceDe('https://outlook.office365.com/owa/calendar/x/calendar.ics'), 'Outlook');
  const maintenant = new Date('2026-10-21T12:05:00');
  assert.equal(S.depuisQuand('2026-10-21T11:53:00', maintenant), 'il y a 12 min');
  assert.equal(S.depuisQuand('2026-10-21T09:05:00', maintenant), 'il y a 3 h');
  assert.equal(S.depuisQuand(null, maintenant), 'jamais');
  assert.equal(S.resumeAbo({ nb: 12, maj_le: '2026-10-21T12:04:40' }, maintenant), '12 événements · lu à l\'instant');
  assert.equal(S.resumeAbo({ erreur: 'Ce lien n\'existe plus' }), 'Ce lien n\'existe plus');

  const abos = [{ id: 'a1', nom: 'Travail', member_id: 'm1', actif: true }, { id: 'a2', nom: 'Coupé', actif: false }];
  const donnees = {
    a1: { evenements: [
      { cle: 'yoga', titre: 'Yoga', debut: new Date(2026, 10, 2, 18, 30).toISOString(), fin: new Date(2026, 10, 2, 19, 30).toISOString(), journee: false, lieu: 'Salle', recurrence: { freq: 'hebdo', jours: [1] }, exceptions: ['2026-11-09'] },
      { cle: 'ski', titre: 'Ski', debut: new Date(2026, 10, 13).toISOString(), fin: new Date(2026, 10, 15).toISOString(), journee: true, exceptions: [] },
    ] },
    a2: { evenements: [{ cle: 'z', titre: 'Caché', debut: new Date(2026, 10, 10, 9).toISOString(), fin: new Date(2026, 10, 10, 10).toISOString(), journee: false, exceptions: [] }] },
  };
  const els = J(S.elementsImport(abos, donnees, new Date(2026, 10, 2), new Date(2026, 10, 16), A.occurrences));
  assert.deepEqual(els.map((e) => [e.date, e.heure, e.titre]), [['2026-11-02', '18:30', 'Yoga'], ['2026-11-16', '18:30', 'Yoga'], ['2026-11-13', null, 'Ski'], ['2026-11-14', null, 'Ski'], ['2026-11-15', null, 'Ski']]);
  assert.equal(els[0].detail, 'Salle · Travail');
  assert.deepEqual(els[0].membres, ['m1']);
  assert.equal(els[0].act, 'agenda-synchro-voir');
  assert.equal(S.elementsImport(abos, donnees, new Date(2026, 10, 2), new Date(2026, 10, 16), null).length, 0);
});
