// Module « Agenda familial » (Famille › Agenda).
// Événements du foyer (table evenements) avec récurrences, exceptions, « qui s'en occupe ? » et rappels par personne ;
// vues jour, semaine, mois et « par personne » ; une couleur par membre (table agenda_couleurs) ;
// anniversaires et fêtes, vacances scolaires de la zone A (Grenoble) et jours fériés (API publiques, mises en cache) ;
// éléments des autres modules (Agenda.sources : repas, séances partagées, santé…).
// Les fonctions de récurrence (occurrences, règles RRULE) sont exposées pour le futur module de synchronisation.

const cache = Modules.cache('agenda');
const JOUR_MS = 864e5;
const ACADEMIE = 'Grenoble';
const URL_FERIES = 'https://calendrier.api.gouv.fr/jours-feries/metropole.json';
const URL_VACANCES = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';

// --- Données en mémoire -------------------------------------------------------
let evenements = [];
let couleurs = {}; // member_id → 'm1'…'m6'
const vue = { mode: store.get('agenda:vue', 'semaine'), curseur: null, filtre: null, jour: null };
let ext = { cle: '', items: [], t: 0, attente: '' };

// --- Petites aides de dates (heure locale) -------------------------------------
const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dIso = (s) => { const [y, m, j] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, j); };
const avecHeure = (jour, hhmm) => { const [h, mi] = String(hhmm || '00:00').split(':').map(Number); return new Date(jour.getFullYear(), jour.getMonth(), jour.getDate(), h || 0, mi || 0); };
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const jourIso = (d) => ((d.getDay() + 6) % 7) + 1; // lundi = 1 … dimanche = 7
const pad = (n) => String(n).padStart(2, '0');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']; // index 0 = lundi
const JOURS_PLURIEL = ['lundis', 'mardis', 'mercredis', 'jeudis', 'vendredis', 'samedis', 'dimanches'];
const JOURS_COURT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const maj = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const quantieme = (n) => (n === 1 ? '1er' : String(n));
const fmtHeure = (h) => { if (!h) return ''; const [a, b] = h.split(':').map(Number); return b ? `${a} h ${pad(b)}` : `${a} h`; };
const fmtDate = (d) => `${quantieme(d.getDate())} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
const fmtJourLong = (d) => `${JOURS[jourIso(d) - 1]} ${quantieme(d.getDate())} ${MOIS[d.getMonth()]}`;
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const fmtJourCourt = (d) => `${JOURS[jourIso(d) - 1].slice(0, 3)}. ${d.getDate()} ${MOIS_COURT[d.getMonth()]}`;
const listeEt = (l) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`);
const de = (nom) => (/^[aeiouyàâéèêëîïôûü]/i.test(nom) ? `d'${nom}` : `de ${nom}`); // « d'Antoine », « de Zoé »
const aplatir = (s) => s.split('').map((c) => c.toLowerCase().normalize('NFD')[0] || c).join('');

// --- Récurrences (fonctions pures) ---------------------------------------------
// recurrence = { freq: 'quotidienne' | 'hebdo' | 'mensuelle' | 'annuelle', intervalle?: n, jours?: [1-7] (hebdo, lundi = 1),
//                jusqu?: 'AAAA-MM-JJ' (inclus), nombre?: n (occurrences, exceptions comprises, comme COUNT en iCalendar),
//                nonGere?, rrule? (règle d'un autre agenda, gardée telle quelle et non modifiable ici) }
// exceptions = ['AAAA-MM-JJ'] : dates retirées de la série.
const FREQS = { quotidienne: 'Tous les jours', hebdo: 'Chaque semaine', mensuelle: 'Chaque mois', annuelle: 'Chaque année' };

// Début, fin et durée d'un événement. Journée entière : fin = dernier jour (inclus).
function bornes(ev) {
  const d = new Date(ev.debut);
  let f = ev.fin ? new Date(ev.fin) : null;
  if (ev.journee) {
    const d0 = minuit(d);
    const f0 = f && f > d0 ? minuit(f) : d0;
    return { debut: d0, jours: Math.round((f0 - d0) / JOUR_MS), duree: 0 };
  }
  if (!f || f < d) f = new Date(d.getTime() + 3600e3);
  return { debut: d, jours: 0, duree: f - d };
}

// Règle mensuelle « n-ième jour de la semaine » d'un autre agenda (rrule BYDAY=2TU, -1FR) → { rang, jour: 1-7 } ou null.
function rangJour(rec) {
  if (!rec?.rrule || rec.freq !== 'mensuelle') return null;
  const kv = Object.fromEntries(String(rec.rrule).replace(/^RRULE:/i, '').split(';').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
  if (Object.keys(kv).some((k) => !['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'COUNT', 'WKST'].includes(k))) return null;
  const m = String(kv.BYDAY || '').match(/^([+-]?[1-5])(MO|TU|WE|TH|FR|SA|SU)$/);
  return m ? { rang: Number(m[1]), jour: RR_JOURS.indexOf(m[2]) + 1 } : null;
}
// n-ième jour (1-7) d'un mois (rang négatif : en partant de la fin) ; null si ce mois n'en a pas.
function nemeJour(an, mois, { rang, jour }) {
  const premier = new Date(an, mois, 1);
  const nbJours = new Date(premier.getFullYear(), premier.getMonth() + 1, 0).getDate();
  if (rang > 0) {
    const j = 1 + ((jour - jourIso(premier) + 7) % 7) + (rang - 1) * 7;
    return j <= nbJours ? new Date(premier.getFullYear(), premier.getMonth(), j) : null;
  }
  const dernier = new Date(premier.getFullYear(), premier.getMonth(), nbJours);
  const j = nbJours - ((jourIso(dernier) - jour + 7) % 7) + (rang + 1) * 7;
  return j >= 1 ? new Date(premier.getFullYear(), premier.getMonth(), j) : null;
}
// Règle d'un autre agenda que l'appli ne sait pas calculer exactement : dates affichées approximatives.
const approximative = (rec) => !!rec?.nonGere && !rangJour(rec);

// Dates candidates d'une série (minuit local), dans l'ordre ; null = mois ou année sans ce jour (sauté).
function* candidats(rec, d0) {
  const n = Math.max(1, Math.floor(Number(rec.intervalle) || 1));
  if (rec.freq === 'quotidienne') { for (let k = 0; ; k++) yield addDays(d0, k * n); }
  if (rec.freq === 'hebdo') {
    const jours = [...new Set((rec.jours && rec.jours.length ? rec.jours : [jourIso(d0)]).map(Number))].filter((j) => j >= 1 && j <= 7).sort();
    const lundi = mondayOf(d0);
    for (let w = 0; ; w++) {
      const base = addDays(lundi, w * 7 * n);
      for (const j of jours) { const x = addDays(base, j - 1); if (x >= d0) yield x; }
    }
  }
  const rj = rangJour(rec);
  if (rec.freq === 'mensuelle' && rj) {
    // « 2e mardi du mois », « dernier vendredi » (règle venue d'un autre agenda) : dates exactes.
    for (let k = 0; ; k++) {
      const x = nemeJour(d0.getFullYear(), d0.getMonth() + k * n, rj);
      yield x && x >= d0 ? x : null;
    }
  }
  if (rec.freq === 'mensuelle') {
    for (let k = 0; ; k++) {
      const x = new Date(d0.getFullYear(), d0.getMonth() + k * n, d0.getDate());
      yield x.getDate() === d0.getDate() ? x : null;
    }
  }
  if (rec.freq === 'annuelle') {
    for (let k = 0; ; k++) {
      const x = new Date(d0.getFullYear() + k * n, d0.getMonth(), d0.getDate());
      yield x.getMonth() === d0.getMonth() ? x : null;
    }
  }
}

// Occurrences d'un événement qui touchent la période [a, b] (jours inclus).
// → [{ ev, debut: Date, fin: Date, date: 'AAAA-MM-JJ', rang, cle }] ; pour une journée entière, fin = dernier jour.
function occurrences(ev, a, b) {
  if (!ev || !ev.debut) return [];
  const { debut, jours, duree } = bornes(ev);
  const debP = minuit(a), finP = addDays(minuit(b), 1);
  const ex = new Set(ev.exceptions || []);
  const out = [];
  const ajouter = (jour, rang) => {
    const deb = ev.journee ? jour : avecHeure(jour, hm(debut));
    const fin = ev.journee ? addDays(jour, jours) : new Date(deb.getTime() + duree);
    const finExcl = ev.journee ? addDays(fin, 1) : fin;
    const touche = deb < finP && (finExcl > debP || (+finExcl === +deb && deb >= debP));
    if (touche) out.push({ ev, debut: deb, fin, date: isoDate(deb), rang, cle: `${ev.id}:${isoDate(deb)}` });
  };
  const rec = ev.recurrence;
  if (!rec || !FREQS[rec.freq]) { ajouter(minuit(debut), 1); return out; }
  const limite = rec.jusqu ? addDays(dIso(rec.jusqu), 1) : null;
  const marge = addDays(debP, -(jours + 1)); // une occurrence de plusieurs jours commencée avant la période
  let rang = 0, garde = 0;
  for (const j of candidats(rec, minuit(debut))) {
    if (++garde > 40000) break;
    if (j === null) continue;
    if (j >= finP || (limite && j >= limite)) break;
    rang++;
    if (rec.nombre && rang > rec.nombre) break;
    if (j < marge || ex.has(isoDate(j))) continue;
    ajouter(j, rang);
  }
  return out;
}

// Prochaine occurrence à partir d'une date (dans l'année qui suit).
const prochaine = (ev, apres = new Date()) => occurrences(ev, apres, addDays(apres, 400)).find((o) => (ev.journee ? addDays(o.fin, 1) : o.fin) > apres) || null;

// Règle en français : « Tous les mercredis », « Une semaine sur deux, le lundi et le jeudi, jusqu'au 30 juin 2027 ».
function regleTexte(rec, debut) {
  if (!rec || !FREQS[rec.freq]) return '';
  const n = Math.max(1, Math.floor(Number(rec.intervalle) || 1));
  const d = debut ? new Date(debut) : null;
  let t = '';
  if (rec.freq === 'quotidienne') t = n === 1 ? 'Tous les jours' : `Tous les ${n} jours`;
  if (rec.freq === 'hebdo') {
    const jours = [...new Set((rec.jours && rec.jours.length ? rec.jours : d ? [jourIso(d)] : []).map(Number))].sort();
    if (n === 1) t = jours.length === 7 ? 'Tous les jours' : jours.length ? `Tous les ${listeEt(jours.map((j) => JOURS_PLURIEL[j - 1]))}` : 'Chaque semaine';
    else t = `${n === 2 ? 'Une semaine sur deux' : `Toutes les ${n} semaines`}${jours.length ? `, ${listeEt(jours.map((j) => `le ${JOURS[j - 1]}`))}` : ''}`;
  }
  const rj = rangJour(rec);
  if (rec.freq === 'mensuelle') t = `${n === 1 ? 'Tous les mois' : `Tous les ${n} mois`}${rj ? `, le ${rj.rang === -1 ? 'dernier ' : rj.rang === -2 ? 'avant-dernier ' : rj.rang === 1 ? '1er ' : `${Math.abs(rj.rang)}e `}${JOURS[rj.jour - 1]}${rj.rang < -2 ? ' en partant de la fin' : ''}` : d ? `, le ${quantieme(d.getDate())}` : ''}`;
  if (rec.freq === 'annuelle') t = `${n === 1 ? 'Tous les ans' : `Tous les ${n} ans`}${d ? `, le ${quantieme(d.getDate())} ${MOIS[d.getMonth()]}` : ''}`;
  if (rec.jusqu) t += `, jusqu'au ${fmtDate(dIso(rec.jusqu))}`;
  else if (rec.nombre) t += `, ${rec.nombre} fois`;
  if (approximative(rec)) t += ' (règle d\'un autre agenda : dates approximatives)';
  return t;
}

// Conversion vers et depuis une règle iCalendar (RRULE), pour l'export ICS et l'import d'agendas.
const RR_FREQ = { quotidienne: 'DAILY', hebdo: 'WEEKLY', mensuelle: 'MONTHLY', annuelle: 'YEARLY' };
const RR_JOURS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
function versRRule(rec, { journee = false } = {}) {
  if (!rec || !RR_FREQ[rec.freq]) return '';
  // Règle d'un autre agenda : renvoyée telle quelle, seule la fin suit l'appli.
  const p = rec.rrule ? String(rec.rrule).replace(/^RRULE:/i, '').split(';').filter((x) => x && !/^(UNTIL|COUNT)=/i.test(x)) : [`FREQ=${RR_FREQ[rec.freq]}`];
  const n = Math.max(1, Math.floor(Number(rec.intervalle) || 1));
  if (n > 1 && !rec.rrule) p.push(`INTERVAL=${n}`);
  if (rec.freq === 'hebdo' && rec.jours && rec.jours.length && !rec.rrule) p.push(`BYDAY=${[...new Set(rec.jours.map(Number))].sort().map((j) => RR_JOURS[j - 1]).join(',')}`);
  if (rec.jusqu) {
    const f = dIso(rec.jusqu);
    if (journee) p.push(`UNTIL=${f.getFullYear()}${pad(f.getMonth() + 1)}${pad(f.getDate())}`);
    else { const z = new Date(f.getFullYear(), f.getMonth(), f.getDate(), 23, 59, 59); p.push(`UNTIL=${z.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`); }
  } else if (rec.nombre) p.push(`COUNT=${rec.nombre}`);
  return p.join(';');
}
// → recurrence, ou null ; nonGere: true si la règle contient des parties non comprises (ex. « 2e mercredi du mois »).
function depuisRRule(texte) {
  const s = String(texte || '').replace(/^RRULE:/i, '').trim();
  if (!s) return null;
  const kv = Object.fromEntries(s.split(';').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
  const freq = Object.keys(RR_FREQ).find((k) => RR_FREQ[k] === String(kv.FREQ || '').toUpperCase());
  if (!freq) return null;
  const rec = { freq };
  let nonGere = Object.keys(kv).some((k) => !['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'COUNT', 'WKST'].includes(k));
  if (Number(kv.INTERVAL) > 1) rec.intervalle = Number(kv.INTERVAL);
  if (kv.BYDAY) {
    const codes = kv.BYDAY.split(',');
    if (codes.some((c) => !RR_JOURS.includes(c)) || freq !== 'hebdo') nonGere = true;
    const jours = codes.map((c) => RR_JOURS.indexOf(c.replace(/^[+-]?\d+/, '')) + 1).filter((j) => j > 0);
    if (freq === 'hebdo' && jours.length) rec.jours = [...new Set(jours)].sort();
  }
  if (kv.COUNT) rec.nombre = Number(kv.COUNT);
  if (kv.UNTIL) {
    const m = kv.UNTIL.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (m) {
      const d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(+m[1], +m[2] - 1, +m[3]);
      rec.jusqu = isoDate(d);
    }
  }
  if (nonGere) { rec.nonGere = true; rec.rrule = s; }
  return rec;
}

// Rappels à envoyer sur une période : [{ evenement_id, member_id, minutes, quand: Date, debut: Date, titre }], triés.
function rappelsPeriode(liste, a, b) {
  const out = [];
  for (const ev of liste || []) {
    if (!ev.rappels || !ev.rappels.length) continue;
    const max = Math.max(...ev.rappels.map((r) => Number(r.minutes) || 0));
    for (const o of occurrences(ev, a, addDays(b, Math.ceil(max / 1440) + 1))) {
      const deb = ev.journee ? avecHeure(o.debut, '09:00') : o.debut;
      for (const r of ev.rappels) {
        const quand = new Date(deb.getTime() - (Number(r.minutes) || 0) * 60e3);
        if (quand >= minuit(a) && quand < addDays(minuit(b), 1)) out.push({ evenement_id: ev.id, member_id: r.member_id, minutes: Number(r.minutes) || 0, quand, debut: deb, titre: ev.titre });
      }
    }
  }
  return out.sort((x, y) => x.quand - y.quand);
}

// --- Jours fériés, fêtes, vacances (fonctions pures) -------------------------
function paques(an) { // algorithme de Meeus (calendrier grégorien)
  const a = an % 19, b = Math.floor(an / 100), c = an % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(an, mois - 1, jour);
}
// Jours fériés de métropole calculés dans le téléphone (secours quand l'API publique ne répond pas).
function joursFeries(an) {
  const p = paques(an);
  const l = [[new Date(an, 0, 1), '1er janvier'], [addDays(p, 1), 'Lundi de Pâques'], [new Date(an, 4, 1), '1er mai'], [new Date(an, 4, 8), '8 mai'],
    [addDays(p, 39), 'Ascension'], [addDays(p, 50), 'Lundi de Pentecôte'], [new Date(an, 6, 14), '14 juillet'], [new Date(an, 7, 15), 'Assomption'],
    [new Date(an, 10, 1), 'Toussaint'], [new Date(an, 10, 11), '11 novembre'], [new Date(an, 11, 25), 'Jour de Noël']];
  return l.map(([d, titre]) => ({ date: isoDate(d), titre }));
}
// Réponse de calendrier.api.gouv.fr ({ 'AAAA-MM-JJ': 'nom' }) → [{ date, titre }].
const feriesDepuisApi = (json) => Object.entries(json || {}).filter(([d, t]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && t).map(([date, titre]) => ({ date, titre: String(titre) })).sort((a, b) => a.date.localeCompare(b.date));
// Réponse de data.education.gouv.fr → [{ debut, fin (inclus), titre }]. Les dates de l'API sont les minuits de Paris en UTC
// (début = premier jour sans classe, fin = jour de reprise) : on ajoute 12 h pour retrouver le jour, sans dépendre du fuseau.
function vacancesDepuisApi(json) {
  const jourUtc = (s) => { const d = new Date(new Date(s).getTime() + 12 * 3600e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const vu = new Set();
  const out = [];
  for (const r of (json && json.results) || []) {
    if (!r.start_date || !r.end_date || /enseignant/i.test(r.population || '')) continue;
    const debut = jourUtc(r.start_date);
    const reprise = dIso(jourUtc(r.end_date));
    const fin = isoDate(addDays(reprise, -1));
    const titre = String(r.description || 'Vacances scolaires').replace(/\s+/g, ' ').trim();
    const cle = `${debut}|${titre}`;
    if (vu.has(cle) || fin < debut) continue;
    vu.add(cle);
    out.push({ debut, fin, titre });
  }
  return out.sort((a, b) => a.debut.localeCompare(b.debut));
}
// Fêtes des prénoms (calendrier usuel) et fêtes de famille.
const FETES = { antoine: '06-13', manon: '08-15', zoe: '05-02', julie: '04-08', lea: '03-22', marie: '08-15', nicolas: '12-06', pierre: '06-29', paul: '06-29', jean: '06-24', louis: '08-25', lucas: '10-18',
  camille: '07-14', thomas: '07-03', emma: '04-19', louise: '03-15', jules: '04-12', leo: '11-10', gabriel: '09-29', arthur: '11-15', alice: '12-16', sophie: '05-25', anne: '07-26', joseph: '03-19',
  michel: '09-29', martin: '11-11', catherine: '11-25', claire: '08-11', luc: '10-18', marc: '04-25', clement: '11-23', mathilde: '03-14', elise: '11-17', lucie: '12-13' };
function fetesFamille(an) {
  const dernierDimanche = (m) => { const d = new Date(an, m + 1, 0); return addDays(d, -(d.getDay())); };
  let meres = dernierDimanche(4);
  if (isoDate(meres) === isoDate(addDays(paques(an), 49))) meres = addDays(meres, 7); // Pentecôte : premier dimanche de juin
  const juin1 = new Date(an, 5, 1);
  const peres = addDays(juin1, ((7 - juin1.getDay()) % 7) + 14);
  const mars1 = new Date(an, 2, 1);
  const gmeres = addDays(mars1, (7 - mars1.getDay()) % 7);
  return [{ date: isoDate(gmeres), titre: 'Fête des grands-mères' }, { date: isoDate(meres), titre: 'Fête des mères' }, { date: isoDate(peres), titre: 'Fête des pères' }];
}
// Anniversaires et fêtes des membres sur la période : [{ date, titre, detail, member_id, type }].
function anniversairesMembres(membres, a, b, { fetes = true } = {}) {
  const out = [];
  for (let an = a.getFullYear(); an <= b.getFullYear(); an++) {
    for (const m of membres || []) {
      if (m.naissance) {
        const n = dIso(m.naissance);
        const d = new Date(an, n.getMonth(), n.getDate());
        if (d.getMonth() === n.getMonth() && an > n.getFullYear()) out.push({ date: isoDate(d), titre: `Anniversaire ${de(m.nom)}`, detail: `${an - n.getFullYear()} an${an - n.getFullYear() > 1 ? 's' : ''}`, member_id: m.id, type: 'anniversaire' });
      }
      const f = fetes && FETES[sansAccents(m.nom).trim().split(/[\s-]/)[0]];
      if (f) out.push({ date: `${an}-${f}`, titre: `Fête ${de(m.nom)}`, detail: 'Fête du prénom', member_id: m.id, type: 'fete' });
    }
  }
  const da = isoDate(a), db2 = isoDate(b);
  return out.filter((x) => x.date >= da && x.date <= db2).sort((x, y) => x.date.localeCompare(y.date));
}

// --- Phrase libre → événement (fonction pure) ----------------------------------
// parseEvenement('judo Zoé mercredi 14 h', { maintenant, membres }) →
//   { titre, date, heure, heureFin, journee, membres, responsable, responsableRetour, recurrence, categorie } ou null si ni date ni récurrence.
const RE_JOURS = '(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';
const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, quinze: 15 };
function parseEvenement(texte, { maintenant = new Date(), membres = [] } = {}) {
  let t = ` ${String(texte || '').replace(/[«»"]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const n = () => aplatir(t);
  const retirer = (re) => { const m = n().match(re); if (!m) return null; t = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`; return m; };
  let recurrence = null, categorie = 'evenement', heure = null, heureFin = null, responsable = null, responsableRetour = null, m;
  // Récurrence
  if ((m = retirer(/ (?:tous les|toutes les|chaque) (\d+|deux|trois|quatre|quinze) (jours|semaines|mois|ans) /))) {
    const k = NOMBRES[m[1]] || Number(m[1]);
    if (m[2] === 'jours' && k % 7 === 0) recurrence = { freq: 'hebdo', intervalle: k / 7 };
    else if (m[2] === 'jours' && k === 15) recurrence = { freq: 'hebdo', intervalle: 2 };
    else recurrence = { freq: { jours: 'quotidienne', semaines: 'hebdo', mois: 'mensuelle', ans: 'annuelle' }[m[2]], intervalle: k };
    if (recurrence.intervalle === 1) delete recurrence.intervalle;
  } else if ((m = retirer(new RegExp(` (?:tous les|chaque|les) ${RE_JOURS}s?((?:(?:,| et|, et) ${RE_JOURS}s?)*) `)))) {
    const noms = m[0].match(new RegExp(RE_JOURS, 'g'));
    recurrence = { freq: 'hebdo', jours: [...new Set(noms.map((x) => JOURS.indexOf(x) + 1))].sort() };
  } else if (retirer(/ (?:tous les jours|chaque jour|quotidiennement) /)) recurrence = { freq: 'quotidienne' };
  else if (retirer(/ (?:toutes les semaines|chaque semaine|une semaine sur deux) /)) recurrence = /sur deux/.test(texte) ? { freq: 'hebdo', intervalle: 2 } : { freq: 'hebdo' };
  else if (retirer(/ (?:tous les mois|chaque mois|mensuel) /)) recurrence = { freq: 'mensuelle' };
  else if (retirer(/ (?:tous les ans|chaque annee|annuel) /)) recurrence = { freq: 'annuelle' };
  if (/ anniv(?:ersaire)?s? /.test(n())) { categorie = 'anniversaire'; recurrence = recurrence || { freq: 'annuelle' }; }
  else if (/ (?:rdv|rendez[- ]vous|dentiste|medecin|pediatre|docteur|kine|orthophoniste|osteo|vaccin|ophtalmo|veto|veterinaire) /.test(n())) categorie = 'rdv';
  else if (/ (?:judo|danse|piscine|natation|foot|football|tennis|gym|eveil|musique|cours|entrainement|club) /.test(n())) categorie = 'activite';
  // Plage horaire : « de 14 h à 16 h », « 14h-15h30 », « entre 9 h et 11 h »
  if ((m = retirer(/ (?:de |entre )?(\d{1,2}) ?(?:h|:) ?(\d{2})? ?(?:a|-|–|et|jusqu'a) ?(\d{1,2}) ?(?:h|:) ?(\d{2})? /))) {
    if (+m[1] < 24 && +m[3] < 24) { heure = `${pad(+m[1])}:${pad(+(m[2] || 0))}`; heureFin = `${pad(+m[3])}:${pad(+(m[4] || 0))}`; }
  }
  // Qui s'en occupe : « par Manon », « Antoine dépose », « récupéré par Antoine »
  for (const mb of membres) {
    const nom = sansAccents(mb.nom).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!nom) continue;
    if (retirer(new RegExp(` (?:(?:recupere|ramene|retour)e?s? (?:par )?${nom}|${nom} (?:recupere|ramene)) `))) responsableRetour = mb.id;
    else if (retirer(new RegExp(` (?:(?:depose|emmene|conduit|accompagne)e?s? par ${nom}|${nom} (?:depose|emmene|conduit|accompagne)|par ${nom}) `))) responsable = mb.id;
  }
  const p = analysePhrase(t, { maintenant, membres });
  heure = heure || p.heure;
  let date = p.date;
  if (!date && !recurrence) return null;
  const jour0 = minuit(maintenant);
  if (!date) date = isoDate(jour0);
  if (recurrence && recurrence.freq === 'hebdo') {
    if (!recurrence.jours) recurrence.jours = p.date ? [jourIso(dIso(date))] : undefined;
    if (recurrence.jours) { let d = dIso(date); for (let i = 0; i < 7 && !recurrence.jours.includes(jourIso(d)); i++) d = addDays(d, 1); date = isoDate(d); }
    if (!recurrence.jours) delete recurrence.jours;
  }
  let titre = p.texte.replace(/^(?:(?:le|la|les|a|à|au|pour|de|du|avec|,|-|:)\s+)+/i, '').replace(/(?:\s+(?:le|la|a|à|au|de|pour|avec|et|,|-))+$/i, '').replace(/^[,;:\s-]+|[,;:\s-]+$/g, '').trim();
  titre = maj(titre) || (categorie === 'anniversaire' ? 'Anniversaire' : 'Événement');
  if (heure && !heureFin) heureFin = hm(new Date(avecHeure(dIso(date), heure).getTime() + 3600e3));
  return { titre, date, heure, heureFin: heure ? heureFin : null, journee: !heure, membres: p.membres, responsable, responsableRetour, recurrence, categorie };
}
// Événement analysé → ligne de la table evenements.
function versLigne(p) {
  const jour = dIso(p.date);
  const debut = p.journee ? jour : avecHeure(jour, p.heure);
  let fin = p.journee ? dIso(p.dateFin || p.date) : avecHeure(dIso(p.dateFin || p.date), p.heureFin || hm(new Date(debut.getTime() + 3600e3)));
  if (!p.journee && fin <= debut) fin = new Date(debut.getTime() + 3600e3);
  return { titre: p.titre, categorie: p.categorie || 'evenement', debut: debut.toISOString(), fin: fin.toISOString(), journee: !!p.journee, lieu: p.lieu || null, notes: p.notes || null,
    membres: p.membres || [], responsable: p.responsable || null, responsable_retour: p.responsableRetour || null, recurrence: p.recurrence || null, exceptions: p.exceptions || [], rappels: p.rappels || [] };
}

// --- Couleurs des membres -----------------------------------------------------
// Uniquement des jetons du thème : chaque univers peut définir --m1…--m6 ; à défaut, couleurs du thème courant.
const PALETTE = [['m1', 'var(--m1, var(--primary))'], ['m2', 'var(--m2, var(--sky))'], ['m3', 'var(--m3, var(--mango-strong))'],
  ['m4', 'var(--m4, var(--mint))'], ['m5', 'var(--m5, var(--sage-light))'], ['m6', 'var(--m6, var(--primary-strong))']];
const COULEUR_FOYER = 'var(--muted)';
function slotMembre(id, membres = state.members, choix = couleurs) {
  if (choix[id] && PALETTE.some(([k]) => k === choix[id])) return choix[id];
  const i = Math.max(0, membres.findIndex((m) => m.id === id));
  return PALETTE[i % PALETTE.length][0];
}
const couleurMembre = (id) => (id && memberById(id) ? PALETTE.find(([k]) => k === slotMembre(id))[1] : COULEUR_FOYER);
const nomMembre = (id) => memberById(id)?.nom || '';
const couleurEv = (ev) => couleurMembre((ev.membres || [])[0] || ev.responsable);

// --- Préférences d'affichage (appareil) ----------------------------------------
const AFFICHAGE = [['vacances', 'Vacances scolaires (zone A, Grenoble)'], ['feries', 'Jours fériés'], ['anniversaires', 'Anniversaires des membres'], ['fetes', 'Fêtes des prénoms et fêtes de famille'], ['autres', 'Repas, séances et autres modules']];
const affiche = (k) => store.get('agenda:affichage', {})[k] !== false;

// --- Vacances et jours fériés : API publiques, cache local ---------------------
function publics() { return store.get('agenda:public', { vacances: [], feries: [], maj: 0 }); }
async function chargerPublics(force = false) {
  const p = publics();
  if (!force && p.maj && Date.now() - p.maj < 7 * JOUR_MS) return false;
  const depuis = `${new Date().getFullYear() - 1}-01-01`;
  const q = new URLSearchParams({ where: `location="${ACADEMIE}" and end_date>="${depuis}"`, order_by: 'start_date', limit: '100', select: 'description,start_date,end_date,population' });
  const [f, v] = await Promise.allSettled([
    fetch(URL_FERIES).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`jours fériés : ${r.status}`)))),
    fetch(`${URL_VACANCES}?${q}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`vacances : ${r.status}`)))),
  ]);
  const suivant = { vacances: v.status === 'fulfilled' ? vacancesDepuisApi(v.value) : p.vacances, feries: f.status === 'fulfilled' ? feriesDepuisApi(f.value) : p.feries,
    maj: f.status === 'fulfilled' && v.status === 'fulfilled' ? Date.now() : p.maj };
  store.set('agenda:public', suivant);
  return f.status === 'fulfilled' || v.status === 'fulfilled';
}
// Jours fériés de la période : ceux de l'API, et le calcul local pour les années qu'elle ne couvre pas.
function feriesPeriode(a, b) {
  const api = publics().feries;
  const ans = new Set(api.map((x) => x.date.slice(0, 4)));
  const out = [];
  for (let an = a.getFullYear(); an <= b.getFullYear(); an++) out.push(...(ans.has(String(an)) ? api.filter((x) => x.date.startsWith(`${an}-`)) : joursFeries(an)));
  return out.filter((x) => x.date >= isoDate(a) && x.date <= isoDate(b));
}
const vacancesDu = (iso) => publics().vacances.find((v) => v.debut <= iso && v.fin >= iso) || null;

// --- Éléments d'une période (événements + spéciaux + autres modules) ----------------
const concerne = (ev, id) => !id || (ev.membres || []).includes(id) || ev.responsable === id || ev.responsable_retour === id || !(ev.membres || []).length;
function occurrencesPeriode(a, b, filtre = vue.filtre) {
  return evenements.flatMap((ev) => occurrences(ev, a, b)).filter((o) => concerne(o.ev, filtre));
}
// Liste plate d'éléments datés pour [a, b], au format d'Agenda.sources (un élément par jour couvert).
function elementsModule(a, b, { filtre = null, avecSpeciaux = true } = {}) {
  const out = [];
  for (const o of occurrencesPeriode(a, b, filtre)) {
    const dernier = minuit(o.ev.journee ? o.fin : new Date(o.fin.getTime() - 1));
    for (let d = minuit(o.debut); d <= dernier && d <= b; d = addDays(d, 1)) {
      if (d < minuit(a)) continue;
      const premier = isoDate(d) === o.date;
      out.push({ id: `ev:${o.cle}:${isoDate(d)}`, date: isoDate(d), heure: o.ev.journee || !premier ? null : hm(o.debut), heureFin: o.ev.journee ? null : hm(o.fin),
        titre: o.ev.titre, detail: detailEv(o.ev), membres: o.ev.membres || [], couleur: couleurEv(o.ev), act: 'agenda-voir', data: { id: o.ev.id, date: o.date }, type: o.ev.categorie || 'evenement', recurrent: !!o.ev.recurrence, ev: o.ev });
    }
  }
  if (avecSpeciaux) {
    if (affiche('feries')) for (const f of feriesPeriode(a, b)) out.push({ id: `ferie:${f.date}`, date: f.date, heure: null, titre: f.titre, detail: 'Jour férié', type: 'ferie' });
    const membres = filtre ? state.members.filter((m) => m.id === filtre) : state.members;
    if (affiche('anniversaires') || affiche('fetes')) {
      for (const x of anniversairesMembres(membres, a, b, { fetes: affiche('fetes') })) {
        if (x.type === 'anniversaire' && !affiche('anniversaires')) continue;
        out.push({ id: `${x.type}:${x.member_id}:${x.date}`, date: x.date, heure: null, titre: x.titre, detail: x.detail, membres: [x.member_id], couleur: couleurMembre(x.member_id), type: x.type });
      }
    }
    if (affiche('fetes') && !filtre) for (let an = a.getFullYear(); an <= b.getFullYear(); an++) for (const x of fetesFamille(an)) if (x.date >= isoDate(a) && x.date <= isoDate(b)) out.push({ id: `fete:${x.date}`, date: x.date, heure: null, titre: x.titre, type: 'fete' });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || (x.heure || '').localeCompare(y.heure || ''));
}
function detailEv(ev) {
  const l = [];
  if (ev.lieu) l.push(ev.lieu);
  const qui = (ev.membres || []).map(nomMembre).filter(Boolean);
  if (qui.length) l.push(listeEt(qui));
  if (ev.responsable) l.push(ev.responsable_retour && ev.responsable_retour !== ev.responsable ? `aller : ${nomMembre(ev.responsable)}` : `${nomMembre(ev.responsable)} s'en occupe`);
  if (ev.responsable_retour) l.push(`retour : ${nomMembre(ev.responsable_retour)}`);
  return l.join(' · ');
}
// Éléments des autres modules (async) : mis en cache pour la période affichée, l'écran est redessiné à l'arrivée.
function externes(a, b) {
  if (!affiche('autres')) return [];
  const cle = `${isoDate(a)}_${isoDate(b)}`;
  // Agenda.version : augmentée par un module dont les éléments changent (agenda importé…), pour relire tout de suite.
  const frais = ext.cle === cle && ext.v === (Agenda.version || 0) && Date.now() - ext.t < 5000;
  if (!frais && ext.attente !== cle) {
    ext.attente = cle;
    Agenda.elements(a, b).then((l) => {
      if (ext.attente !== cle) return;
      const items = l.filter((e) => e.source !== 'agenda');
      const change = ext.cle !== cle || JSON.stringify(items) !== JSON.stringify(ext.items);
      ext = { cle, items, t: Date.now(), attente: '', v: Agenda.version || 0 };
      if (change && state.tab === 'agenda') render();
    }).catch(() => { ext.attente = ''; });
  }
  if (ext.cle !== cle) return [];
  return ext.items.filter((e) => !vue.filtre || !(e.membres || []).length || e.membres.includes(vue.filtre));
}
function elementsAffiches(a, b) {
  return [...elementsModule(a, b, { filtre: vue.filtre }), ...externes(a, b).map((e) => ({ ...e, externe: true }))]
    .sort((x, y) => x.date.localeCompare(y.date) || (x.heure ? 1 : 0) - (y.heure ? 1 : 0) || (x.heure || '').localeCompare(y.heure || ''));
}

// --- Rendu --------------------------------------------------------------------
const ICO = {
  cal: I('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>'),
  rep: I('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  cloche: I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  gateau: I('<path d="M4 21V12h16v9M2 21h20M4 16c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 4 0M12 12V8M12 5.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5"/>'),
  lieu: I('<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'),
  soleil: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  drapeau: I('<path d="M5 22V4M5 4h11l-2 4 2 4H5"/>'),
  reglages: I('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
};
const dataAttrs = (data) => Object.entries(data || {}).map(([k, v]) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${esc(v)}"`).join(' ');
const curseur = () => vue.curseur || minuit(new Date());
function periode(mode = vue.mode, c = curseur()) {
  if (mode === 'jour') return [c, c];
  if (mode === 'mois') { const a = new Date(c.getFullYear(), c.getMonth(), 1); const b = new Date(c.getFullYear(), c.getMonth() + 1, 0); return [mondayOf(a), addDays(mondayOf(b), 6)]; }
  const a = mondayOf(c);
  return [a, addDays(a, 6)];
}
function titrePeriode(mode = vue.mode, c = curseur()) {
  if (mode === 'jour') return maj(fmtJourLong(c));
  if (mode === 'mois') return `${maj(MOIS[c.getMonth()])} ${c.getFullYear()}`;
  const [a, b] = periode('semaine', c);
  return a.getMonth() === b.getMonth() ? `Du ${quantieme(a.getDate())} au ${b.getDate()} ${MOIS[b.getMonth()]}` : `Du ${quantieme(a.getDate())} ${MOIS[a.getMonth()]} au ${quantieme(b.getDate())} ${MOIS[b.getMonth()]}`;
}
const pastille = (couleur) => `<i class="agenda-pastille" style="--agenda-c:${couleur || COULEUR_FOYER}"></i>`;
function icoType(e) {
  if (e.type === 'anniversaire') return ICO.gateau;
  if (e.type === 'ferie') return ICO.drapeau;
  return '';
}
function ligne(e, { date = false } = {}) {
  const heure = e.heure ? `<b>${esc(fmtHeure(e.heure))}</b>${e.heureFin && e.heureFin !== e.heure ? `<small>${esc(fmtHeure(e.heureFin))}</small>` : ''}` : '<small>journée</small>';
  const membres = (e.membres || []).length > 1 ? `<span class="agenda-qui">${e.membres.map((id) => pastille(couleurMembre(id))).join('')}</span>` : '';
  const act = e.act ? `data-act="${esc(e.act)}" ${dataAttrs(e.data)}` : 'disabled';
  return `<li><button type="button" class="agenda-item${e.externe ? ' externe' : ''} t-${esc(e.type || 'evenement')}" style="--agenda-c:${e.couleur || COULEUR_FOYER}" ${act}>
    <span class="agenda-heure">${date ? `<small>${esc(fmtJourCourt(dIso(e.date)))}</small>` : ''}${heure}</span>
    <span class="agenda-texte"><b>${icoType(e)}${esc(e.titre)}</b>${e.detail ? `<span>${esc(e.detail)}</span>` : ''}</span>
    ${membres}${e.recurrent ? `<span class="agenda-rep" title="Se répète">${ICO.rep}</span>` : ''}${e.externe && e.source ? `<span class="agenda-source">${esc(libelleSource(e.source))}</span>` : ''}</button></li>`;
}
const libelleSource = (id) => ({ planning: 'Repas', forme: 'Séance' }[id] || Modules.get(id)?.segment || '');
function bandeaux(iso) {
  const out = [];
  const v = affiche('vacances') && vacancesDu(iso);
  if (v) out.push(`<div class="agenda-bandeau vacances">${ICO.soleil}<span><b>${esc(v.titre)}</b> · zone A, du ${esc(fmtJourCourt(dIso(v.debut)))} au ${esc(fmtJourCourt(dIso(v.fin)))}</span></div>`);
  return out.join('');
}
function listeJour(iso, items) {
  const l = items.filter((e) => e.date === iso);
  return l.length ? `<ol class="agenda-liste">${l.map((e) => ligne(e)).join('')}</ol>` : '<p class="agenda-vide">Rien de prévu.</p>';
}
function vueJour(a) {
  const iso = isoDate(a);
  const items = elementsAffiches(a, a);
  return `${bandeaux(iso)}<section class="card agenda-carte">${listeJour(iso, items)}</section>`;
}
function vueSemaine(a, b) {
  const items = elementsAffiches(a, b);
  const auj = isoDate(new Date());
  const carte = (d) => {
    const iso = isoDate(d);
    const v = affiche('vacances') && vacancesDu(iso);
    return `<section class="card agenda-carte agenda-jour${iso === auj ? ' auj' : ''}${v ? ' vac' : ''}">
      <button type="button" class="agenda-jour-titre" data-act="agenda-jour" data-date="${iso}"><b>${esc(maj(fmtJourLong(d)))}</b>${iso === auj ? '<span class="agenda-tag">Aujourd\'hui</span>' : ''}${v ? `<span class="agenda-tag vac" title="${esc(v.titre)}">Vacances</span>` : ''}</button>
      ${listeJour(iso, items)}</section>`;
  };
  const passes = [], suite = [];
  for (let d = a; d <= b; d = addDays(d, 1)) (isoDate(d) < auj ? passes : suite).push(d);
  // Semaine en cours : on commence par aujourd'hui ; les jours déjà passés sont repliés au-dessus (pas de lundi en tête un vendredi).
  if (!passes.length || !suite.length) return [...passes, ...suite].map(carte).join('');
  const de = (d) => fmtJourLong(d).split(' ')[0];
  const nb = items.filter((e) => e.date < auj && e.type !== 'ferie').length;
  return `<details class="agenda-passes"><summary>Début de semaine (${esc(de(passes[0]))}${passes.length > 1 ? ` → ${esc(de(passes[passes.length - 1]))}` : ''})${nb ? ` · ${nb} élément${nb > 1 ? 's' : ''}` : ''}</summary>${passes.map(carte).join('')}</details>${suite.map(carte).join('')}`;
}
function vueMois(a, b) {
  const c = curseur();
  const items = elementsAffiches(a, b);
  const choisi = vue.jour && vue.jour >= isoDate(a) && vue.jour <= isoDate(b) ? vue.jour : isoDate(c);
  const auj = isoDate(new Date());
  const feries = new Set(items.filter((e) => e.type === 'ferie').map((e) => e.date));
  let cases = '';
  for (let d = a; d <= b; d = addDays(d, 1)) {
    const iso = isoDate(d);
    const l = items.filter((e) => e.date === iso && e.type !== 'ferie');
    const cls = [d.getMonth() !== c.getMonth() && 'hors', iso === auj && 'auj', iso === choisi && 'choisi', affiche('vacances') && vacancesDu(iso) && 'vac', feries.has(iso) && 'ferie'].filter(Boolean).join(' ');
    const points = l.slice(0, 3).map((e) => pastille(e.couleur)).join('') + (l.length > 3 ? '<small>+</small>' : '');
    cases += `<button type="button" class="agenda-case ${cls}" data-act="agenda-choisir" data-date="${iso}" aria-pressed="${iso === choisi}" aria-label="${esc(fmtJourLong(d))}${l.length ? `, ${l.length} élément${l.length > 1 ? 's' : ''}` : ''}"><span>${d.getDate()}</span><span class="agenda-points">${points}</span></button>`;
  }
  return `<section class="card agenda-carte agenda-mois"><div class="agenda-grille">${JOURS_COURT.map((j) => `<span class="agenda-entete-j">${j}</span>`).join('')}${cases}</div>
    <p class="agenda-legende muted small"><span class="agenda-leg vac"></span> vacances scolaires · <span class="agenda-leg ferie"></span> jour férié</p></section>
    ${bandeaux(choisi)}<section class="card agenda-carte"><button type="button" class="agenda-jour-titre" data-act="agenda-jour" data-date="${choisi}"><b>${esc(maj(fmtJourLong(dIso(choisi))))}</b>${ICON.next}</button>${listeJour(choisi, items)}</section>`;
}
function vuePersonnes(a, b) {
  const items = elementsAffiches(a, b);
  const blocs = state.members.filter((m) => !vue.filtre || m.id === vue.filtre).map((m) => {
    const l = items.filter((e) => (e.membres || []).includes(m.id) || (e.ev && (e.ev.responsable === m.id || e.ev.responsable_retour === m.id)));
    return `<section class="card agenda-carte agenda-personne" style="--agenda-c:${couleurMembre(m.id)}"><h3>${pastille(couleurMembre(m.id))}${esc(m.nom)}<span class="muted small">${l.length ? `${l.length} élément${l.length > 1 ? 's' : ''}` : ''}</span></h3>
      ${l.length ? `<ol class="agenda-liste">${l.map((e) => ligne(e, { date: true })).join('')}</ol>` : '<p class="agenda-vide">Rien de prévu cette semaine.</p>'}</section>`;
  });
  const tous = items.filter((e) => !(e.membres || []).length && e.type !== 'ferie' && e.type !== 'fete' && !(e.ev && (e.ev.responsable || e.ev.responsable_retour)));
  if (!vue.filtre && tous.length) blocs.push(`<section class="card agenda-carte agenda-personne"><h3>${pastille(COULEUR_FOYER)}Toute la famille</h3><ol class="agenda-liste">${tous.map((e) => ligne(e, { date: true })).join('')}</ol></section>`);
  return blocs.join('') || '<div class="empty"><p>Ajoute les membres du foyer dans les réglages pour voir l\'agenda de chacun.</p></div>';
}
function rendu() {
  const [a, b] = periode();
  const modes = [['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois'], ['personnes', 'Personnes']];
  const filtres = state.members.length > 1 ? `<div class="chips agenda-filtres" role="group" aria-label="Filtrer par membre">
    <button type="button" class="chip" data-act="agenda-filtre" data-id="" aria-pressed="${!vue.filtre}">Tout le monde</button>
    ${state.members.map((m) => `<button type="button" class="chip" data-act="agenda-filtre" data-id="${m.id}" aria-pressed="${vue.filtre === m.id}">${pastille(couleurMembre(m.id))}${esc(m.nom)}</button>`).join('')}</div>` : '';
  const corps = vue.mode === 'jour' ? vueJour(a) : vue.mode === 'mois' ? vueMois(a, b) : vue.mode === 'personnes' ? vuePersonnes(a, b) : vueSemaine(a, b);
  return `<div class="agenda">
    <div class="agenda-modes" role="tablist" aria-label="Vue">${modes.map(([k, l]) => `<button type="button" role="tab" data-act="agenda-mode" data-mode="${k}" aria-selected="${vue.mode === k}">${l}</button>`).join('')}</div>
    <div class="agenda-nav">
      <button type="button" class="icon-btn" data-act="agenda-pas" data-pas="-1" aria-label="Précédent">${ICON.back}</button>
      <b class="agenda-periode">${esc(vue.mode === 'personnes' ? titrePeriode('semaine') : titrePeriode())}</b>
      <button type="button" class="icon-btn" data-act="agenda-pas" data-pas="1" aria-label="Suivant">${ICON.next}</button>
      <button type="button" class="btn small" data-act="agenda-auj">Aujourd'hui</button>
      <button type="button" class="icon-btn" data-act="agenda-reglages" aria-label="Réglages de l'agenda">${ICO.reglages}</button>
    </div>
    ${filtres}
    <button type="button" class="btn primary block agenda-ajouter" data-act="agenda-nouveau">${ICON.plus} Nouvel événement</button>
    ${corps}</div>`;
}

// --- Feuilles : détail, formulaire, réglages ----------------------------------
const MINUTES = [[0, 'À l\'heure'], [5, '5 min avant'], [10, '10 min avant'], [15, '15 min avant'], [30, '30 min avant'], [60, '1 h avant'], [120, '2 h avant'], [1440, 'La veille'], [2880, '2 jours avant']];
const CATEGORIES = [['evenement', 'Événement'], ['rdv', 'Rendez-vous'], ['activite', 'Activité'], ['anniversaire', 'Anniversaire']];
const libMinutes = (n) => (MINUTES.find(([k]) => k === Number(n)) || [0, `${n} min avant`])[1];
const evParId = (id) => evenements.find((e) => e.id === id) || null;

function voir(id, date) {
  const ev = evParId(id);
  if (!ev) return toast('Événement introuvable');
  const o = (date && occurrences(ev, dIso(date), dIso(date)).find((x) => x.date === date)) || occurrences(ev, bornes(ev).debut, bornes(ev).debut)[0] || { debut: bornes(ev).debut, fin: bornes(ev).debut, date: isoDate(bornes(ev).debut) };
  const quand = ev.journee
    ? (isoDate(o.fin) !== o.date ? `Du ${fmtJourLong(o.debut)} au ${fmtJourLong(o.fin)}` : `${maj(fmtJourLong(o.debut))}, toute la journée`)
    : `${maj(fmtJourLong(o.debut))}, ${fmtHeure(hm(o.debut))} – ${isoDate(o.fin) !== o.date ? `${fmtJourCourt(o.fin)} ` : ''}${fmtHeure(hm(o.fin))}`;
  const age = ev.categorie === 'anniversaire' && ev.recurrence && o.debut.getFullYear() > bornes(ev).debut.getFullYear() ? ` · ${o.debut.getFullYear() - bornes(ev).debut.getFullYear()} ans` : '';
  const qui = (ev.membres || []).map((m) => `<span class="agenda-membre">${pastille(couleurMembre(m))}${esc(nomMembre(m))}</span>`).join('') || '<span class="muted">Toute la famille</span>';
  const lignes = [
    `<div class="agenda-det">${ICO.cal}<span>${esc(quand)}${esc(age)}</span></div>`,
    ev.recurrence ? `<div class="agenda-det">${ICO.rep}<span>${esc(regleTexte(ev.recurrence, ev.debut))}</span></div>` : '',
    ev.lieu ? `<div class="agenda-det">${ICO.lieu}<span>${esc(ev.lieu)}</span></div>` : '',
    `<div class="agenda-det">${ICON.users}<span class="agenda-membres">${qui}</span></div>`,
    ev.responsable || ev.responsable_retour ? `<div class="agenda-det">${ICON.clock}<span>${ev.responsable ? `${ev.responsable_retour ? 'Aller' : 'S\'en occupe'} : <b>${esc(nomMembre(ev.responsable))}</b>` : ''}${ev.responsable && ev.responsable_retour ? ' · ' : ''}${ev.responsable_retour ? `Retour : <b>${esc(nomMembre(ev.responsable_retour))}</b>` : ''}</span></div>` : '',
    (ev.rappels || []).length ? `<div class="agenda-det">${ICO.cloche}<span>${ev.rappels.map((r) => `${esc(nomMembre(r.member_id) || 'Quelqu\'un')} : ${esc(libMinutes(r.minutes).toLowerCase())}`).join(' · ')}</span></div>` : '',
    ev.notes ? `<p class="agenda-notes">${esc(ev.notes)}</p>` : '',
  ].join('');
  const el = openSheet(`${sheetHead(ev.titre)}<div class="agenda-fiche" style="--agenda-c:${couleurEv(ev)}">${lignes}</div>
    <div class="grid2" style="margin-top:16px"><button class="btn" data-x="modifier">${ICON.edit} Modifier</button><button class="btn danger" data-x="suppr">${ICON.trash} Supprimer</button></div>`);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    if (b.dataset.x === 'modifier') {
      if (!ev.recurrence) { closeSheet(); return formulaire(ev); }
      const choix = await choisirPortee('Modifier', false);
      if (!choix) return;
      closeSheet();
      if (choix === 'serie') formulaire(ev);
      else formulaire(ev, { occurrence: o });
    }
    if (b.dataset.x === 'suppr') {
      const choix = ev.recurrence ? await choisirPortee('Supprimer', true) : ((await confirmSheet(`Supprimer « ${ev.titre} » ?`, 'Supprimer')) ? 'serie' : null);
      if (!choix) return;
      closeSheet();
      supprimer(ev, choix, o.date).catch(fail);
    }
  });
}
// Portée d'une modification sur une série : 'une' (cette fois), 'suivantes', 'serie'.
function choisirPortee(verbe, suivantes) {
  return new Promise((resolve) => {
    let fini = false;
    const el = openSheet(`${sheetHead(`${verbe} l'événement`)}<p class="muted" style="margin-top:0">Cet événement se répète.</p>
      <div class="stack"><button class="btn block" data-p="une">Cette fois seulement</button>${suivantes ? '<button class="btn block" data-p="suivantes">Cette fois et les suivantes</button>' : ''}<button class="btn block ${verbe === 'Supprimer' ? 'danger' : ''}" data-p="serie">Toute la série</button></div>`,
    { onClose: () => { if (!fini) resolve(null); } });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; fini = true; resolve(b.dataset.p); closeSheet(); });
  });
}

async function enregistrer(row) {
  const ligneEnr = await Sync.upsert(T.evenements, row);
  const i = evenements.findIndex((e) => e.id === ligneEnr.id);
  if (i >= 0) evenements[i] = ligneEnr; else evenements.push(ligneEnr);
  cache.set('evenements', evenements);
  ext.t = 0;
  prevenirModif(ligneEnr, i >= 0 ? 'modifié' : 'ajouté');
  return ligneEnr;
}
// Notification « agenda modifié » aux autres comptes (module notifications ; coupée par défaut, chacun l'active).
// Identifiant par tranche de 2 minutes : les retouches rapprochées n'en font qu'une, chaque modification plus tardive
// fait une nouvelle ligne (une ligne déjà envoyée ne repart jamais).
const idModif = (evId, t = Date.now()) => `agenda-modif:${evId}:${Math.floor(t / 120000)}`;
function prevenirModif(ev, verbe) {
  const N = Modules.get('notifications')?.expose;
  if (!N?.programmer || ev.source) return;
  const qui = memberById(state.compte?.member_id)?.nom || 'Quelqu\'un';
  N.programmer({ id: idModif(ev.id), type: 'agenda_modifs', titre: 'Agenda de la famille', corps: `${qui} a ${verbe} « ${ev.titre} »`, url: './#agenda', sauf_auteur: true, envoyer_a: new Date(Date.now() + 2 * 60000) }).catch(() => {});
}
async function supprimer(ev, portee, date) {
  if (portee === 'une') { await enregistrer({ ...ev, exceptions: [...new Set([...(ev.exceptions || []), date])] }); toast('Cette fois est retirée de la série'); }
  else if (portee === 'suivantes' && date > isoDate(bornes(ev).debut)) {
    const { nombre, ...rec } = ev.recurrence;
    await enregistrer({ ...ev, recurrence: { ...rec, ...(nombre ? { nombre } : {}), jusqu: isoDate(addDays(dIso(date), -1)) } });
    toast('Les prochaines fois sont supprimées');
  } else {
    await Sync.supprimer(T.evenements, ev.id);
    evenements = evenements.filter((e) => e.id !== ev.id);
    cache.set('evenements', evenements);
    toast('Événement supprimé');
  }
  render();
}

// Formulaire complet. ev = événement existant (ou valeurs préremplies sans id) ; occurrence = modifier cette fois seulement.
function formulaire(ev = null, { occurrence = null } = {}) {
  const base = ev || {};
  const b0 = base.debut ? bornes(base) : null;
  const deb = occurrence ? occurrence.debut : b0 ? b0.debut : avecHeure(curseur(), isoDate(curseur()) === isoDate(new Date()) ? hm(new Date(Math.ceil(Date.now() / 1800e3) * 1800e3)) : '09:00');
  const finD = occurrence ? occurrence.fin : base.debut ? (base.journee ? addDays(b0.debut, b0.jours) : new Date(b0.debut.getTime() + b0.duree)) : new Date(deb.getTime() + 3600e3);
  const journee = !!base.journee;
  const rec = occurrence ? null : base.recurrence || null;
  const membresSel = new Set(base.membres || []);
  const rappels = Object.fromEntries((base.rappels || []).map((r) => [r.member_id, r.minutes]));
  const opt = (val, sel, lib) => `<option value="${esc(val)}" ${String(val) === String(sel ?? '') ? 'selected' : ''}>${esc(lib)}</option>`;
  const optsMembres = (sel) => opt('', sel, 'Personne') + state.members.map((m) => opt(m.id, sel, m.nom)).join('');
  const titre = occurrence ? 'Modifier cette fois' : base.id ? 'Modifier l\'événement' : 'Nouvel événement';
  const el = openSheet(`${sheetHead(titre)}
    <form class="stack agenda-form" data-form="agenda-evenement" novalidate>
      <label class="field"><span>Titre</span><input class="input" name="titre" required maxlength="120" value="${esc(base.titre || '')}" placeholder="Judo, dentiste, dépôt à la crèche…"></label>
      <div class="chips wrap" role="group" aria-label="Type">${CATEGORIES.map(([k, l]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${(base.categorie || 'evenement') === k}">${l}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" name="journee" ${journee ? 'checked' : ''}> Toute la journée</label>
      <div class="grid2"><label class="field"><span>Début</span><input class="input" type="date" name="date" required value="${isoDate(deb)}"></label>
        <label class="field" data-si="heure"><span>Heure</span><input class="input" type="time" name="heure" step="300" value="${hm(deb)}"></label></div>
      <div class="grid2"><label class="field"><span>Fin</span><input class="input" type="date" name="date_fin" value="${isoDate(finD)}"></label>
        <label class="field" data-si="heure"><span>Heure de fin</span><input class="input" type="time" name="heure_fin" step="300" value="${hm(finD)}"></label></div>
      <label class="field"><span>Lieu</span><input class="input" name="lieu" maxlength="160" value="${esc(base.lieu || '')}" placeholder="Facultatif"></label>
      ${state.members.length ? `<div class="field"><span>Pour qui ?</span><div class="chips wrap" role="group" aria-label="Pour qui">${state.members.map((m) => `<button type="button" class="chip" data-membre="${m.id}" aria-pressed="${membresSel.has(m.id)}">${pastille(couleurMembre(m.id))}${esc(m.nom)}</button>`).join('')}</div><small class="muted">Personne de choisi : toute la famille.</small></div>
      <div class="grid2"><label class="field"><span>Qui s'en occupe (aller)</span><select class="input" name="responsable">${optsMembres(base.responsable)}</select></label>
        <label class="field"><span>Retour</span><select class="input" name="responsable_retour">${optsMembres(base.responsable_retour)}</select></label></div>` : ''}
      ${occurrence ? '' : rec?.nonGere ? `<div class="field" data-rec-figee><span>Répétition</span><p class="muted small">${esc(regleTexte(rec, base.debut))}. Cette règle vient d'un autre agenda : modifie-la là-bas, elle est gardée telle quelle ici.</p></div>` : `<label class="field"><span>Répétition</span><select class="input" name="freq">${opt('', rec?.freq, 'Ne se répète pas')}${Object.entries(FREQS).map(([k, l]) => opt(k, rec?.freq, l)).join('')}</select></label>
      <div class="agenda-rec stack" data-si="rec">
        <label class="field agenda-inter"><span>Intervalle</span><span class="row">Toutes les <input class="input" type="number" name="intervalle" min="1" max="52" inputmode="numeric" value="${esc(rec?.intervalle || 1)}"> <span data-unite></span></span></label>
        <div class="field" data-si="hebdo"><span>Les jours</span><div class="agenda-jours" role="group" aria-label="Jours de la semaine">${JOURS.map((j, i) => `<button type="button" class="chip" data-jour="${i + 1}" aria-label="${j}" aria-pressed="${(rec?.jours || [jourIso(deb)]).includes(i + 1)}">${JOURS_COURT[i]}</button>`).join('')}</div></div>
        <div class="grid2"><label class="field"><span>Fin de la répétition</span><select class="input" name="fin_type">${opt('jamais', rec?.jusqu ? 'date' : rec?.nombre ? 'nombre' : 'jamais', 'Jamais')}${opt('date', rec?.jusqu ? 'date' : '', 'À une date')}${opt('nombre', rec?.nombre && !rec?.jusqu ? 'nombre' : '', 'Après un nombre de fois')}</select></label>
          <label class="field" data-si="fin-date"><span>Jusqu'au</span><input class="input" type="date" name="jusqu" value="${esc(rec?.jusqu || '')}"></label>
          <label class="field" data-si="fin-nombre"><span>Nombre de fois</span><input class="input" type="number" name="nombre" min="1" max="999" inputmode="numeric" value="${esc(rec?.nombre || 10)}"></label></div>
        <p class="muted small" data-regle></p>
      </div>`}
      ${state.members.length ? `<details class="agenda-rappels" ${Object.keys(rappels).length ? 'open' : ''}><summary>${ICO.cloche} Rappels par personne</summary>
        <div class="agenda-rappels-grille">${state.members.map((m) => `<label class="field agenda-rappel"><span>${pastille(couleurMembre(m.id))}${esc(m.nom)}</span><select class="input" name="rappel_${m.id}">${opt('', rappels[m.id], 'Pas de rappel')}${MINUTES.map(([k, l]) => opt(k, rappels[m.id], l)).join('')}</select></label>`).join('')}</div></details>` : ''}
      <label class="field"><span>Notes</span><textarea class="input" name="notes" rows="2" maxlength="1000" placeholder="Facultatif">${esc(base.notes || '')}</textarea></label>
      <button class="btn primary block">Enregistrer</button>
    </form>`);
  const f = $('form', el);
  let joursChoisis = !!rec?.jours;
  const montrer = () => {
    const j = f.journee.checked;
    $$('[data-si="heure"]', f).forEach((x) => { x.hidden = j; });
    if (!f.freq) return;
    const fr = f.freq.value;
    $('[data-si="rec"]', f).hidden = !fr;
    $('[data-si="hebdo"]', f).hidden = fr !== 'hebdo';
    const n = Number(f.intervalle.value) || 1;
    $('[data-unite]', f).textContent = { quotidienne: n > 1 ? 'jours' : 'jour', hebdo: n > 1 ? 'semaines' : 'semaine', mensuelle: 'mois', annuelle: n > 1 ? 'ans' : 'an' }[fr] || '';
    $('[data-si="fin-date"]', f).hidden = f.fin_type.value !== 'date';
    $('[data-si="fin-nombre"]', f).hidden = f.fin_type.value !== 'nombre';
    const r = lireRec();
    $('[data-regle]', f).textContent = r ? regleTexte(r, avecHeure(dIso(f.date.value || isoDate(deb)), '12:00')) : '';
  };
  const lireRec = () => {
    if (!f.freq || !f.freq.value) return null;
    const r = { freq: f.freq.value };
    const n = Math.floor(Number(f.intervalle.value) || 1);
    if (n > 1) r.intervalle = n;
    if (r.freq === 'hebdo') r.jours = $$('[data-jour][aria-pressed="true"]', f).map((b) => Number(b.dataset.jour));
    if (r.freq === 'hebdo' && !r.jours.length) r.jours = [jourIso(dIso(f.date.value || isoDate(deb)))];
    if (f.fin_type.value === 'date' && f.jusqu.value) r.jusqu = f.jusqu.value;
    if (f.fin_type.value === 'nombre') r.nombre = Math.max(1, Math.floor(Number(f.nombre.value) || 1));
    return r;
  };
  f.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat],[data-membre],[data-jour]');
    if (!b) return;
    if (b.dataset.cat) {
      $$('[data-cat]', f).forEach((x) => x.setAttribute('aria-pressed', x === b));
      if (b.dataset.cat === 'anniversaire') { f.journee.checked = true; if (f.freq && !f.freq.value) f.freq.value = 'annuelle'; }
    } else b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
    if (b.dataset.jour) joursChoisis = true;
    montrer();
  });
  f.addEventListener('input', montrer);
  f.addEventListener('change', (e) => {
    if (e.target.name === 'date' && f.date_fin.value < f.date.value) f.date_fin.value = f.date.value;
    // Tant que personne n'a touché aux jours de la semaine, ils suivent la date de début.
    if (e.target.name === 'date' && f.date.value && !joursChoisis) { const j = jourIso(dIso(f.date.value)); $$('[data-jour]', f).forEach((x) => x.setAttribute('aria-pressed', Number(x.dataset.jour) === j)); }
    if (e.target.name === 'heure' && f.date_fin.value === f.date.value && f.heure_fin.value <= f.heure.value && f.heure.value) f.heure_fin.value = hm(new Date(avecHeure(dIso(f.date.value), f.heure.value).getTime() + 3600e3));
    montrer();
  });
  montrer();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titreSaisi = f.titre.value.trim();
    if (!titreSaisi) { f.titre.focus(); return toast('Donne un titre à l\'événement'); }
    if (!f.date.value) return toast('Choisis une date');
    const p = { titre: titreSaisi, categorie: $('[data-cat][aria-pressed="true"]', f)?.dataset.cat || 'evenement', journee: f.journee.checked, date: f.date.value, heure: f.heure.value || '09:00',
      dateFin: f.date_fin.value || f.date.value, heureFin: f.heure_fin.value, lieu: f.lieu.value.trim(), notes: f.notes.value.trim(),
      membres: $$('[data-membre][aria-pressed="true"]', f).map((b) => b.dataset.membre), responsable: f.responsable?.value || null, responsableRetour: f.responsable_retour?.value || null,
      recurrence: occurrence ? null : rec?.nonGere ? rec : lireRec(), exceptions: occurrence ? [] : base.exceptions || [],
      rappels: state.members.filter((m) => f[`rappel_${m.id}`] && f[`rappel_${m.id}`].value !== '').map((m) => ({ member_id: m.id, minutes: Number(f[`rappel_${m.id}`].value) })) };
    const debutN = p.journee ? dIso(p.date) : avecHeure(dIso(p.date), p.heure);
    const finN = p.journee ? dIso(p.dateFin) : avecHeure(dIso(p.dateFin), p.heureFin || p.heure);
    if (finN < debutN || (!p.journee && +finN === +debutN && p.heureFin)) return toast('La fin doit venir après le début');
    if (p.recurrence?.jusqu && p.recurrence.jusqu < p.date) return toast('La répétition doit finir après le début');
    const row = versLigne(p);
    try {
      if (occurrence) {
        await enregistrer({ ...row, id: uid() });
        await enregistrer({ ...base, exceptions: [...new Set([...(base.exceptions || []), occurrence.date])] });
      } else await enregistrer(base.id ? { ...row, id: base.id } : row);
      closeSheet();
      toast(base.id ? 'Événement modifié' : 'Événement ajouté');
      vue.curseur = dIso(p.date); vue.jour = p.date;
      if (state.tab === 'agenda') render();
    } catch (err) { fail(err, 'Enregistrement impossible'); }
  });
  if (!base.titre) setTimeout(() => f.titre.focus(), 60);
  return el;
}

function reglages() {
  const el = openSheet(`${sheetHead('Réglages de l\'agenda')}
    ${state.members.length ? `<h3 class="agenda-h3">Une couleur par membre</h3><div class="stack" data-couleurs></div>` : ''}
    <h3 class="agenda-h3">Afficher dans l'agenda</h3>
    <div class="card agenda-carte agenda-affichage">${AFFICHAGE.map(([k, l]) => `<label class="check"><input type="checkbox" data-aff="${k}" ${affiche(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
    <p class="muted small">Vacances : calendrier scolaire de l'Éducation nationale (académie de ${ACADEMIE}). Jours fériés : calendrier.api.gouv.fr. Mis à jour chaque semaine et gardés pour une utilisation hors ligne.</p>
    <button class="btn block" data-x="maj">${ICO.cal} Mettre à jour les vacances et les jours fériés</button>
    ${Modules.get('agenda-synchro') ? `<h3 class="agenda-h3">Autres agendas</h3><p class="muted small">L'agenda de la famille dans ton iPhone, Google ou Outlook, leurs événements ici, et iCloud dans les deux sens.</p><button class="btn block" data-act="agenda-synchro-ouvrir">${ICO.rep} Agendas reliés</button>` : ''}`);
  const dessiner = () => {
    const box = $('[data-couleurs]', el);
    if (!box) return;
    box.innerHTML = state.members.map((m) => `<div class="agenda-couleur"><span class="grow">${pastille(couleurMembre(m.id))}<b>${esc(m.nom)}</b></span>
      <span class="agenda-nuancier" role="radiogroup" aria-label="Couleur de ${esc(m.nom)}">${PALETTE.map(([k, v], i) => `<button type="button" class="agenda-nuance" role="radio" style="--agenda-c:${v}" data-m="${m.id}" data-c="${k}" aria-checked="${slotMembre(m.id) === k}" aria-label="Couleur ${i + 1}"></button>`).join('')}</span></div>`).join('');
  };
  dessiner();
  el.addEventListener('click', async (e) => {
    const n = e.target.closest('[data-c]');
    if (n) {
      couleurs = { ...couleurs, [n.dataset.m]: n.dataset.c };
      cache.set('couleurs', couleurs);
      dessiner(); render();
      try { await Sync.upsert(T.agenda_couleurs, { id: n.dataset.m, member_id: n.dataset.m, couleur: n.dataset.c }); } catch (err) { fail(err, 'Couleur non enregistrée'); }
    }
    if (e.target.closest('[data-x="maj"]')) {
      const ok = await chargerPublics(true).catch(() => false);
      toast(ok ? 'Vacances et jours fériés à jour' : 'Mise à jour impossible pour le moment');
      render();
    }
  });
  el.addEventListener('change', (e) => {
    const k = e.target.dataset.aff;
    if (!k) return;
    store.set('agenda:affichage', { ...store.get('agenda:affichage', {}), [k]: e.target.checked });
    ext.t = 0;
    render();
  });
}

// --- Ajout rapide (« + ») -----------------------------------------------------
function resumeEv(p, membres = state.members) {
  const d = dIso(p.date);
  const l = [p.titre, `${fmtJourCourt(d)}${p.heure ? ` à ${fmtHeure(p.heure)}` : ''}`];
  const qui = (p.membres || []).map((id) => (membres || []).find((m) => m.id === id)?.nom).filter(Boolean);
  if (qui.length) l.push(listeEt(qui));
  if (p.recurrence) l.push(regleTexte(p.recurrence, d).toLowerCase());
  return l.join(' · ');
}

Modules.register({
  id: 'agenda',
  onglet: 'famille',
  segment: 'Agenda',
  ordre: 10,
  libelle: 'Agenda familial',
  tables: { evenements: 'evenements', agenda_couleurs: 'agenda_couleurs' },
  notifications: [{ type: 'agenda_modifs', libelle: 'Modifications de l\'agenda', description: 'Quelqu\'un d\'autre ajoute, déplace ou supprime un événement.', defaut: false }],
  async charger(force, { horsLigne } = {}) {
    evenements = cache.get('evenements', []);
    couleurs = cache.get('couleurs', {});
    if (horsLigne) return;
    chargerPublics().then((ok) => { if (ok && state.tab === 'agenda') render(); }).catch(() => {});
    const [ev, co] = await Promise.all([db.from(T.evenements).select('*').eq('foyer_id', foyer()), db.from(T.agenda_couleurs).select('*').eq('foyer_id', foyer())]);
    if (!co.error) { couleurs = Object.fromEntries((co.data || []).map((c) => [c.member_id || c.id, c.couleur])); cache.set('couleurs', couleurs); }
    if (ev.error) throw ev.error;
    evenements = ev.data || [];
    cache.set('evenements', evenements);
    ext.t = 0;
  },
  rendu,
  actions: {
    'agenda-mode': (b) => { vue.mode = b.dataset.mode; store.set('agenda:vue', vue.mode); render(); },
    'agenda-pas': (b) => {
      const k = Number(b.dataset.pas) || 0, c = curseur();
      vue.curseur = vue.mode === 'jour' ? addDays(c, k) : vue.mode === 'mois' ? new Date(c.getFullYear(), c.getMonth() + k, 1) : addDays(c, 7 * k);
      vue.jour = null;
      render();
    },
    'agenda-auj': () => { vue.curseur = null; vue.jour = null; render(); },
    'agenda-filtre': (b) => { vue.filtre = b.dataset.id || null; render(); },
    'agenda-jour': (b) => { vue.curseur = dIso(b.dataset.date); vue.mode = 'jour'; store.set('agenda:vue', 'jour'); if (state.tab !== 'agenda') switchTab('agenda'); else render(); },
    'agenda-choisir': (b) => { vue.jour = b.dataset.date; render(); },
    'agenda-nouveau': () => formulaire(),
    'agenda-voir': (b) => voir(b.dataset.id, b.dataset.date),
    'agenda-reglages': () => reglages(),
  },
  // Pour les autres modules (fil, export) : événements, fériés, anniversaires et fêtes de la période.
  agenda: (debut, fin) => elementsModule(debut, fin).map(({ ev, ...e }) => e),
  // Tuile de l'Accueil : le prochain événement des 7 jours.
  resume: () => {
    const d = new Date(), auj = isoDate(d), mtn = nowHM();
    const cle = (e) => `${e.date} ${e.heure || '00:00'}`;
    const els = elementsModule(minuit(d), addDays(minuit(d), 6)).filter((e) => e.date > auj || !e.heure || e.heure >= mtn).sort((a, b) => cle(a).localeCompare(cle(b)));
    const e = els[0];
    const nbJour = els.filter((x) => x.date === auj).length;
    if (!e) return { ordre: 10, icone: ICO.cal, titre: 'Agenda', valeur: 'Semaine calme', detail: 'Rien de prévu sur 7 jours', act: 'tab', data: { tab: 'agenda' } };
    const ecart = Math.round((dIso(e.date) - minuit(d)) / 864e5);
    const quand = ecart === 0 ? "Aujourd'hui" : ecart === 1 ? 'Demain' : dIso(e.date).toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase());
    return { ordre: 10, icone: ICO.cal, titre: nbJour > 1 ? `Agenda · ${nbJour} aujourd'hui` : 'Prochain événement', valeur: e.titre,
      detail: `${quand}${e.heure ? ` à ${fmtHeure(e.heure)}` : ''}`, act: 'agenda-jour', data: { date: e.date } };
  },
  sourcesAccueil: (ctx) => {
    const d = ctx.date || new Date();
    const id = ctx.famille ? null : ctx.membre?.id || null;
    return elementsModule(minuit(d), minuit(d), { filtre: id }).map((e) => ({ heure: e.heure, titre: e.titre, detail: e.detail || (e.heureFin && e.heure ? `jusqu'à ${fmtHeure(e.heureFin)}` : ''), icone: e.type === 'anniversaire' ? ICO.gateau : ICO.cal,
      act: e.act || 'agenda-jour', data: e.data || { date: e.date }, priorite: e.type === 'anniversaire' ? 2 : 1 }));
  },
  ajoutRapide: {
    type: 'evenement',
    libelle: 'Événement',
    analyser(texte, ctx) {
      const p = parseEvenement(texte, { maintenant: ctx.maintenant, membres: ctx.membres });
      if (!p) return null;
      // Une répétition sans heure (« sortir les poubelles tous les mardis ») laisse la priorité à une tâche qui commence par un verbe (0,85).
      return { score: p.heure ? 0.9 : p.recurrence ? 0.8 : 0.7, resume: resumeEv(p, ctx.membres), donnees: p };
    },
    async enregistrer(p) {
      const ligneEnr = await enregistrer(versLigne(p));
      vue.curseur = dIso(p.date); vue.jour = p.date;
      return `Ajouté à l'agenda : ${ligneEnr.titre}, ${fmtJourCourt(dIso(p.date))}${p.heure ? ` à ${fmtHeure(p.heure)}` : ''}`;
    },
    ouvrir(texte, ctx) {
      const p = texte ? parseEvenement(texte, { maintenant: ctx.maintenant, membres: ctx.membres }) : null;
      if (!p) return formulaire(texte ? { titre: maj(texte.trim()) } : null);
      formulaire({ ...versLigne(p), id: undefined });
    },
  },
  expose: { occurrences, prochaine, regleTexte, versRRule, depuisRRule, rappelsPeriode, idModif, rappelsPersonnes: (a, b) => rappelsPeriode(evenements, a, b), parseEvenement, versLigne, joursFeries, paques, feriesDepuisApi, vacancesDepuisApi,
    fetesFamille, anniversairesMembres, slotMembre, fmtHeure, fmtJourCourt, titrePeriode, periode, bornes },
});
