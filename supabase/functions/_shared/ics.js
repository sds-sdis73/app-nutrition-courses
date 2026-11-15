// Générateur et analyseur iCalendar (RFC 5545), sans dépendance, partagés par les fonctions agenda-ics et agenda-synchro.
// Vérifiés par les tests unitaires (tests/unit/agenda-synchro.test.js).
// Format d'un événement (celui de la table evenements) :
//   { id, titre, categorie, debut: ISO, fin: ISO | null, journee, lieu, notes, membres: [uuid], recurrence | null, exceptions: ['AAAA-MM-JJ'] }
//   journée entière : debut = minuit du premier jour, fin = minuit du dernier jour (inclus), heure de Paris.
//   recurrence = { freq: quotidienne|hebdo|mensuelle|annuelle, intervalle?, jours?: [1-7, lundi = 1], jusqu?: 'AAAA-MM-JJ', nombre?, nonGere?, rrule? }
//   (nonGere + rrule : règle d'un autre agenda que l'appli ne sait pas modifier, gardée telle quelle)

export const TZ = 'Europe/Paris';
export const PRODID = '-//Tribu & Toutous//Agenda familial//FR';
export const DOMAINE_UID = 'tribu-et-toutous';
const CATEGORIES = ['evenement', 'rdv', 'activite', 'anniversaire'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pad = (n, l = 2) => String(n).padStart(l, '0');

// ---------------------------------------------------------------------------
// Texte : échappement, pliage des lignes longues (75 octets), dépliage
// ---------------------------------------------------------------------------
export const echapper = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
export const desechapper = (s) => String(s ?? '').replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

const octets = (ch) => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
// Coupe une ligne à 75 octets (UTF-8), sans couper un caractère ; les suites commencent par une espace.
export function plier(ligne) {
  const out = [];
  let cur = '', n = 0;
  for (const ch of ligne) {
    const b = octets(ch);
    if (n + b > 75) { out.push(cur); cur = ' '; n = 1; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join('\r\n');
}
export const deplier = (t) => String(t ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');

// Une ligne « NOM;PARAM=valeur;PARAM="a:b":valeur » → { nom, params, valeur }.
export function lireLigne(l) {
  let i = 0, q = false;
  for (; i < l.length; i++) { const c = l[i]; if (c === '"') q = !q; else if (c === ':' && !q) break; }
  const tete = l.slice(0, i), valeur = l.slice(i + 1);
  const parts = [];
  let cur = '';
  q = false;
  for (const c of tete) { if (c === '"') { q = !q; cur += c; } else if (c === ';' && !q) { parts.push(cur); cur = ''; } else cur += c; }
  parts.push(cur);
  const nom = String(parts.shift() || '').trim().toUpperCase();
  const params = {};
  for (const p of parts) { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).trim().toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ''); }
  return { nom, params, valeur };
}

// Arbre des composants : { nom, props: [{ nom, params, valeur, brut }], enfants: [...] }.
export function composants(texte) {
  const racine = { nom: 'RACINE', props: [], enfants: [] };
  const pile = [racine];
  for (const brut of deplier(texte).split('\n')) {
    if (!brut.trim()) continue;
    const p = lireLigne(brut);
    if (p.nom === 'BEGIN') { const c = { nom: p.valeur.trim().toUpperCase(), props: [], enfants: [] }; pile[pile.length - 1].enfants.push(c); pile.push(c); continue; }
    if (p.nom === 'END') { if (pile.length > 1) pile.pop(); continue; }
    pile[pile.length - 1].props.push({ ...p, brut });
  }
  return racine;
}
const prop = (c, nom) => c.props.find((p) => p.nom === nom) || null;
const props = (c, nom) => c.props.filter((p) => p.nom === nom);
const texteDe = (c, nom) => { const p = prop(c, nom); return p ? desechapper(p.valeur).trim() : ''; };
// Composant → texte (lignes repliées).
export function serialiser(c) {
  return [`BEGIN:${c.nom}`, ...c.props.map((p) => plier(p.brut)), ...c.enfants.map(serialiser), `END:${c.nom}`].join('\r\n');
}

// ---------------------------------------------------------------------------
// Fuseaux horaires (heure d'été comprise) avec Intl
// ---------------------------------------------------------------------------
// Noms Windows envoyés par Outlook → noms IANA.
const ALIAS_TZ = {
  'Romance Standard Time': 'Europe/Paris', 'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw', 'GMT Standard Time': 'Europe/London', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC',
  'Eastern Standard Time': 'America/New_York', 'Pacific Standard Time': 'America/Los_Angeles', 'Central Standard Time': 'America/Chicago',
};
const tzValide = (t) => { try { new Intl.DateTimeFormat('en-US', { timeZone: t }); return true; } catch { return false; } };
export function fuseau(tzid) {
  if (!tzid) return TZ;
  const t = String(tzid).trim();
  if (ALIAS_TZ[t]) return ALIAS_TZ[t];
  if (tzValide(t)) return t;
  const m = t.match(/([A-Za-z]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)$/); // « /mozilla.org/20050126_1/Europe/Paris »
  if (m && tzValide(m[1])) return m[1];
  return TZ;
}
const formats = new Map();
// Date, heure et minute murales d'un instant dans un fuseau.
export function partiesDans(date, tz = TZ) {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formats.set(tz, f);
  }
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return { an: +o.year, mois: +o.month, jour: +o.day, h: +o.hour % 24, min: +o.minute, s: +o.second };
}
// Instant d'une heure murale dans un fuseau.
export function instantDe(an, mois, jour, h = 0, min = 0, s = 0, tz = TZ) {
  const voulu = Date.UTC(an, mois - 1, jour, h, min, s);
  let t = voulu;
  for (let i = 0; i < 3; i++) {
    const p = partiesDans(new Date(t), tz);
    const ecart = Date.UTC(p.an, p.mois - 1, p.jour, p.h, p.min, p.s) - voulu;
    if (!ecart) break;
    t -= ecart;
  }
  return new Date(t);
}
const isoJour = (p) => `${p.an}-${pad(p.mois)}-${pad(p.jour)}`;
export const jourParis = (date) => isoJour(partiesDans(new Date(date), TZ));
const minuitParis = (iso) => { const [a, m, j] = iso.split('-').map(Number); return instantDe(a, m, j, 0, 0, 0, TZ); };
const plusJours = (iso, n) => { const [a, m, j] = iso.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1, j + n)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const compact = (iso) => iso.replace(/-/g, '');
export const utcCompact = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const murale = (d) => { const p = partiesDans(new Date(d), TZ); return `${p.an}${pad(p.mois)}${pad(p.jour)}T${pad(p.h)}${pad(p.min)}${pad(p.s)}`; };

// Valeur DATE ou DATE-TIME → { journee: true, date } | { journee: false, instant }.
export function lireDate(p, tzDefaut = TZ) {
  if (!p) return null;
  const v = String(p.valeur).trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  if (!m[4] || String(p.params?.VALUE || '').toUpperCase() === 'DATE') return { journee: true, date: `${m[1]}-${m[2]}-${m[3]}` };
  const [an, mo, j, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] || '0'].map(Number);
  const instant = m[7] ? new Date(Date.UTC(an, mo - 1, j, h, mi, s)) : instantDe(an, mo, j, h, mi, s, p.params?.TZID ? fuseau(p.params.TZID) : tzDefaut);
  return { journee: false, instant };
}
// Plusieurs valeurs séparées par des virgules (EXDATE, RDATE).
const lireDates = (p) => String(p.valeur).split(',').map((v) => lireDate({ ...p, valeur: v })).filter(Boolean);
// Jour (heure de Paris) d'une valeur lue.
const jourDe = (d) => (d.journee ? d.date : jourParis(d.instant));

// Durée « P1W », « P1DT2H », « PT45M », « -PT15M » → millisecondes.
export function duree(v) {
  const m = String(v || '').trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const ms = ((+m[2] || 0) * 7 * 86400 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

// ---------------------------------------------------------------------------
// Récurrence : RRULE ↔ format de l'agenda
// ---------------------------------------------------------------------------
const RR_FREQ = { quotidienne: 'DAILY', hebdo: 'WEEKLY', mensuelle: 'MONTHLY', annuelle: 'YEARLY' };
const RR_JOURS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

// Fin de la série (UNTIL ou COUNT) au format RRULE.
const finRRule = (rec, journee) => (rec.jusqu ? [`UNTIL=${journee ? compact(rec.jusqu) : utcCompact(instantDe(...rec.jusqu.split('-').map(Number), 23, 59, 59, TZ))}`]
  : rec.nombre ? [`COUNT=${Math.floor(rec.nombre)}`] : []);
export function versRRule(rec, { journee = false } = {}) {
  if (!rec || !RR_FREQ[rec.freq]) return '';
  // Règle d'un autre agenda que l'appli ne sait pas représenter (« 2e mardi du mois ») : renvoyée telle quelle,
  // seule la fin (UNTIL / COUNT) suit l'appli (« supprimer cette fois et les suivantes »).
  if (rec.rrule) return [...String(rec.rrule).replace(/^RRULE:/i, '').split(';').filter((x) => x && !/^(UNTIL|COUNT)=/i.test(x)), ...finRRule(rec, journee)].join(';');
  const p = [`FREQ=${RR_FREQ[rec.freq]}`];
  const n = Math.max(1, Math.floor(Number(rec.intervalle) || 1));
  if (n > 1) p.push(`INTERVAL=${n}`);
  if (rec.freq === 'hebdo' && rec.jours?.length) p.push(`BYDAY=${[...new Set(rec.jours.map(Number))].sort().map((j) => RR_JOURS[j - 1]).join(',')}`);
  p.push(...finRRule(rec, journee));
  return p.join(';');
}
// « 2e mardi du mois » et autres règles non gérées : la fréquence est gardée, nonGere: true le signale,
// et la règle d'origine est conservée (rrule) pour être renvoyée telle quelle et calculer les dates exactes quand c'est possible.
export function depuisRRule(texte, dtstart = null) {
  const s = String(texte || '').replace(/^RRULE:/i, '').trim();
  if (!s) return null;
  const kv = Object.fromEntries(s.split(';').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim().toUpperCase(), v.trim()]));
  const freq = Object.keys(RR_FREQ).find((k) => RR_FREQ[k] === String(kv.FREQ || '').toUpperCase());
  if (!freq) return null;
  const rec = { freq };
  let nonGere = Object.keys(kv).some((k) => !['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'COUNT', 'WKST', 'BYMONTHDAY', 'BYMONTH'].includes(k));
  if (Number(kv.INTERVAL) > 1) rec.intervalle = Math.floor(Number(kv.INTERVAL));
  if (kv.BYDAY) {
    const codes = kv.BYDAY.toUpperCase().split(',');
    if (freq !== 'hebdo' || codes.some((c) => !RR_JOURS.includes(c))) nonGere = true;
    const jours = codes.map((c) => RR_JOURS.indexOf(c.replace(/^[+-]?\d+/, '')) + 1).filter((j) => j > 0);
    if (freq === 'hebdo' && jours.length) rec.jours = [...new Set(jours)].sort((a, b) => a - b);
  }
  // BYMONTHDAY / BYMONTH égaux au jour de départ : c'est la règle de base de l'agenda.
  const d0 = dtstart ? jourDe(dtstart).split('-').map(Number) : null;
  if (kv.BYMONTHDAY && !(d0 && kv.BYMONTHDAY.split(',').length === 1 && Number(kv.BYMONTHDAY) === d0[2] && (freq === 'mensuelle' || freq === 'annuelle'))) nonGere = true;
  if (kv.BYMONTH && !(d0 && kv.BYMONTH.split(',').length === 1 && Number(kv.BYMONTH) === d0[1] && freq === 'annuelle')) nonGere = true;
  if (kv.COUNT) rec.nombre = Math.floor(Number(kv.COUNT));
  if (kv.UNTIL) { const u = lireDate({ valeur: kv.UNTIL, params: {} }); if (u) rec.jusqu = jourDe(u); }
  if (nonGere) { rec.nonGere = true; rec.rrule = s; }
  return rec;
}

// ---------------------------------------------------------------------------
// Génération : événement → VEVENT, puis VCALENDAR
// ---------------------------------------------------------------------------
export const VTIMEZONE_PARIS = ['BEGIN:VTIMEZONE', 'TZID:Europe/Paris', 'X-LIC-LOCATION:Europe/Paris',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'].join('\r\n');

export const uidDe = (ev) => ev.source_uid ? String(ev.source_uid).split('#')[0] : `${ev.id}@${DOMAINE_UID}`;

// Propriétés que l'appli écrit elle-même (les autres, comme les alarmes d'iCloud, sont gardées à la fusion).
const GEREES = new Set(['UID', 'DTSTAMP', 'RECURRENCE-ID', 'DTSTART', 'DTEND', 'DURATION', 'SUMMARY', 'LOCATION', 'DESCRIPTION', 'RRULE', 'EXDATE', 'LAST-MODIFIED', 'X-TT-MEMBRES', 'X-TT-CATEGORIE', 'CATEGORIES']);

// Lignes (non repliées) d'un VEVENT. opts : { uid, recurrenceId: 'AAAA-MM-JJ' | ISO, noms: { member_id: nom }, maintenant }.
export function lignesVevent(ev, { uid = uidDe(ev), recurrenceId = null, noms = {}, maintenant = new Date() } = {}) {
  const l = [`UID:${uid}`, `DTSTAMP:${utcCompact(maintenant)}`];
  const journee = !!ev.journee;
  if (recurrenceId) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(recurrenceId)) l.push(journee ? `RECURRENCE-ID;VALUE=DATE:${compact(recurrenceId)}` : `RECURRENCE-ID;TZID=${TZ}:${compact(recurrenceId)}T${murale(ev.debut).slice(9)}`);
    else l.push(`RECURRENCE-ID;TZID=${TZ}:${murale(recurrenceId)}`);
  }
  if (journee) {
    const j1 = jourParis(ev.debut);
    const j2 = ev.fin ? jourParis(ev.fin) : j1;
    l.push(`DTSTART;VALUE=DATE:${compact(j1)}`, `DTEND;VALUE=DATE:${compact(plusJours(j2 < j1 ? j1 : j2, 1))}`);
  } else {
    l.push(`DTSTART;TZID=${TZ}:${murale(ev.debut)}`);
    if (ev.fin && +new Date(ev.fin) > +new Date(ev.debut)) l.push(`DTEND;TZID=${TZ}:${murale(ev.fin)}`);
    else l.push('DURATION:PT0S');
  }
  l.push(`SUMMARY:${echapper(ev.titre || 'Sans titre')}`);
  if (ev.lieu) l.push(`LOCATION:${echapper(ev.lieu)}`);
  const qui = (ev.membres || []).map((id) => noms[id]).filter(Boolean);
  const desc = [ev.notes || '', qui.length ? `Pour : ${qui.join(', ')}` : ''].filter(Boolean).join('\n\n');
  if (desc) l.push(`DESCRIPTION:${echapper(desc)}`);
  if (!recurrenceId && ev.recurrence) {
    const rr = versRRule(ev.recurrence, { journee });
    if (rr) l.push(`RRULE:${rr}`);
    for (const x of [...new Set(ev.exceptions || [])].sort()) l.push(journee ? `EXDATE;VALUE=DATE:${compact(x)}` : `EXDATE;TZID=${TZ}:${compact(x)}T${murale(ev.debut).slice(9)}`);
  }
  if (ev.categorie && ev.categorie !== 'evenement') l.push(`X-TT-CATEGORIE:${ev.categorie}`);
  if ((ev.membres || []).length) l.push(`X-TT-MEMBRES:${ev.membres.join(',')}`);
  if (ev.updated_at) l.push(`LAST-MODIFIED:${utcCompact(ev.updated_at)}`);
  return l;
}
export const vevent = (ev, opts) => ['BEGIN:VEVENT', ...lignesVevent(ev, opts), 'END:VEVENT'].map(plier).join('\r\n');

// Fusion avec le VEVENT distant : nos propriétés remplacent les siennes, le reste (alarmes, invités…) est gardé.
export function fusionnerVevent(distant, ev, opts) {
  if (!distant) return vevent(ev, opts);
  const nouvelles = lignesVevent(ev, opts).map((brut) => ({ ...lireLigne(brut), brut }));
  return serialiser({ nom: 'VEVENT', props: [...nouvelles, ...distant.props.filter((p) => !GEREES.has(p.nom))], enfants: distant.enfants });
}

// Calendrier complet. opts : { nom, methode (abonnement : true ; CalDAV : false), rafraichir: 'PT1H' }.
export function calendrier(vevents, { nom = 'Tribu & Toutous', methode = true, rafraichir = 'PT1H' } = {}) {
  const tete = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN'];
  if (methode) tete.push('METHOD:PUBLISH', `X-WR-CALNAME:${echapper(nom)}`, `X-WR-TIMEZONE:${TZ}`, `REFRESH-INTERVAL;VALUE=DURATION:${rafraichir}`, `X-PUBLISHED-TTL:${rafraichir}`);
  return [...tete.map(plier), VTIMEZONE_PARIS, ...vevents, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

// Lien d'abonnement (.ics) : les événements créés dans l'appli, et les occurrences de leurs séries modifiées ailleurs
// (sur l'iPhone par CalDAV : lignes source « icloud » dont le source_uid vaut « <uid de la série>#<date> »).
// Ces occurrences sont publiées avec l'UID de la série et un RECURRENCE-ID, comme dans la ressource CalDAV.
export function veventsAbonnement(lignes, { noms = {}, maintenant = new Date() } = {}) {
  const series = (lignes || []).filter((r) => !r.source);
  const uids = new Set(series.map((r) => uidDe(r)));
  const out = series.map((r) => vevent(r, { noms, maintenant }));
  for (const r of lignes || []) {
    const [uid, rid] = String(r.source_uid || '').split('#');
    if (!r.source || !rid || !uids.has(uid)) continue;
    out.push(vevent(r, { uid, recurrenceId: rid, noms, maintenant }));
  }
  return out;
}

// Un événement de l'appli et ses exceptions modifiées (lignes avec source_uid « uid#date ») → ressource CalDAV.
// distant : texte iCalendar actuel de la ressource (pour garder ce que l'appli ne gère pas).
export function ressource(lignes, { distant = '', noms = {}, maintenant = new Date() } = {}) {
  const maitre = lignes.find((r) => !String(r.source_uid || '').includes('#')) || lignes[0];
  const uid = uidDe(maitre);
  const vieux = distant ? composants(distant).enfants.find((c) => c.nom === 'VCALENDAR')?.enfants.filter((c) => c.nom === 'VEVENT') || [] : [];
  const cleRid = (c) => { const p = prop(c, 'RECURRENCE-ID'); const d = p && lireDate(p); return d ? (d.journee ? d.date : d.instant.toISOString()) : ''; };
  const ves = lignes.map((r) => {
    const rid = String(r.source_uid || '').split('#')[1] || null;
    const ancien = vieux.find((c) => cleRid(c) === (rid || ''));
    return fusionnerVevent(ancien, r, { uid, recurrenceId: rid, noms, maintenant });
  });
  return calendrier(ves, { methode: false });
}

// ---------------------------------------------------------------------------
// Analyse : texte iCalendar → événements au format de l'agenda
// ---------------------------------------------------------------------------
const tronque = (s, n) => (s.length > n ? s.slice(0, n) : s);

// Un VEVENT → événement (sans id) ; null s'il est annulé ou illisible.
export function depuisVevent(c, tzDefaut = TZ) {
  if (texteDe(c, 'STATUS').toUpperCase() === 'CANCELLED') return null;
  const d0 = lireDate(prop(c, 'DTSTART'), tzDefaut);
  if (!d0) return null;
  const pFin = prop(c, 'DTEND') || prop(c, 'DUE');
  let d1 = pFin ? lireDate(pFin, tzDefaut) : null;
  const dur = duree(prop(c, 'DURATION')?.valeur);
  const ev = { titre: tronque(texteDe(c, 'SUMMARY') || 'Sans titre', 200), journee: d0.journee, lieu: texteDe(c, 'LOCATION') || null, notes: texteDe(c, 'DESCRIPTION') || null };
  if (d0.journee) {
    let dernier = d0.date;
    if (d1?.journee) dernier = plusJours(d1.date, -1);
    else if (dur != null && dur > 0) dernier = plusJours(d0.date, Math.max(0, Math.ceil(dur / 86400000) - 1));
    if (dernier < d0.date) dernier = d0.date;
    ev.debut = minuitParis(d0.date).toISOString();
    ev.fin = minuitParis(dernier).toISOString();
  } else {
    ev.debut = d0.instant.toISOString();
    let fin = d1 && !d1.journee ? d1.instant : dur != null ? new Date(+d0.instant + dur) : null;
    if (fin && +fin < +d0.instant) fin = null;
    ev.fin = fin ? fin.toISOString() : ev.debut;
  }
  const rr = prop(c, 'RRULE');
  ev.recurrence = rr ? depuisRRule(rr.valeur, d0) : null;
  ev.exceptions = ev.recurrence ? [...new Set(props(c, 'EXDATE').flatMap(lireDates).map(jourDe))].sort() : [];
  const cat = texteDe(c, 'X-TT-CATEGORIE');
  ev.categorie = CATEGORIES.includes(cat) ? cat : 'evenement';
  ev.membres = texteDe(c, 'X-TT-MEMBRES').split(',').map((x) => x.trim()).filter((x) => UUID.test(x));
  return ev;
}

// Texte iCalendar → { nom, evenements: [{ uid, rid, cle, ...événement }] }.
// Une occurrence modifiée (RECURRENCE-ID) devient un événement à part, et sa date est retirée de la série.
// fenetre : { depuis: Date } ignore les événements ponctuels terminés avant cette date.
export function analyserIcs(texte, { fenetre = null, max = 5000 } = {}) {
  const cal = composants(texte).enfants.find((c) => c.nom === 'VCALENDAR');
  if (!cal) throw new Error('Ce lien ne renvoie pas un agenda au format iCalendar (.ics).');
  const tzDefaut = fuseau(texteDe(cal, 'X-WR-TIMEZONE') || TZ);
  const nom = texteDe(cal, 'X-WR-CALNAME') || null;
  const maitres = new Map(), modifs = [], annules = [];
  for (const c of cal.enfants.filter((x) => x.nom === 'VEVENT')) {
    const uid = texteDe(c, 'UID') || `sans-uid-${maitres.size + modifs.length}`;
    const pRid = prop(c, 'RECURRENCE-ID');
    if (pRid) {
      const d = lireDate(pRid, tzDefaut);
      if (!d) continue;
      const rid = d.journee ? d.date : d.instant.toISOString();
      const ev = depuisVevent(c, tzDefaut);
      if (ev) modifs.push({ uid, rid, jour: jourDe(d), ev }); else annules.push({ uid, jour: jourDe(d) });
      continue;
    }
    const ev = depuisVevent(c, tzDefaut);
    if (ev) maitres.set(uid, { uid, rid: null, ev });
  }
  for (const m of [...modifs, ...annules]) {
    const maitre = maitres.get(m.uid);
    if (maitre?.ev.recurrence) maitre.ev.exceptions = [...new Set([...maitre.ev.exceptions, m.jour])].sort();
  }
  const finDe = (ev) => +new Date(ev.fin || ev.debut);
  const garde = (ev) => !fenetre?.depuis || ev.recurrence || finDe(ev) >= +fenetre.depuis;
  const evenements = [...maitres.values(), ...modifs].filter((x) => garde(x.ev)).slice(0, max)
    .map((x) => ({ uid: x.uid, rid: x.rid, cle: x.rid ? `${x.uid}#${x.rid}` : x.uid, ...x.ev }));
  return { nom, evenements };
}
