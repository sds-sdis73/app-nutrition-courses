// CalDAV (iCloud) : corps des requêtes, lecture des réponses « multistatus » et plan de synchronisation.
// Fonctions pures (sans réseau), utilisées par la fonction agenda-synchro et vérifiées par tests/unit/agenda-synchro.test.js.
// Deno n'a pas de DOMParser : les réponses XML sont lues par expressions régulières, quel que soit le préfixe d'espace de noms.
import { analyserIcs, ressource, uidDe, jourParis, DOMAINE_UID } from './ics.js';

export const ICLOUD = 'https://caldav.icloud.com/';
const XML = '<?xml version="1.0" encoding="utf-8"?>';
export const CORPS_PRINCIPAL = `${XML}<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
export const CORPS_DOSSIER = `${XML}<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
export const CORPS_CALENDRIERS = `${XML}<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/">`
  + '<d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><cs:getctag/><ic:calendar-color/></d:prop></d:propfind>';
const utc = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
export const corpsRequete = (debut, fin) => `${XML}<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>`
  + `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${utc(debut)}" end="${utc(fin)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;

// Identifiant et mot de passe → en-tête Basic (UTF-8).
export function basic(identifiant, motDePasse) {
  const o = new TextEncoder().encode(`${identifiant}:${motDePasse}`);
  let s = '';
  for (const b of o) s += String.fromCharCode(b);
  return `Basic ${btoa(s)}`;
}
// Mot de passe d'application Apple : 16 lettres, souvent écrit xxxx-xxxx-xxxx-xxxx.
export const motDePasseAppValide = (m) => /^[a-z]{4}-?[a-z]{4}-?[a-z]{4}-?[a-z]{4}$/i.test(String(m || '').trim());

// ---------------------------------------------------------------------------
// Lecture XML
// ---------------------------------------------------------------------------
const entites = (s) => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
// Contenu brut du premier élément de nom local « nom » (préfixe quelconque) ; '' s'il est vide, null s'il est absent.
export function element(xml, nom) {
  const re = new RegExp(`<([A-Za-z][\\w.-]*:)?${nom}(?=[\\s/>])[^>]*?(\\/>|>([\\s\\S]*?)<\\/\\1?${nom}\\s*>)`);
  const m = String(xml).match(re);
  if (!m) return null;
  return m[2] === '/>' ? '' : m[3];
}
export const texte = (xml, nom) => { const c = element(xml, nom); return c == null ? null : entites(c).trim(); };

// Réponse multistatus → [{ href, props: { nomLocal: contenu brut } }] ; seuls les propstat en 200 sont gardés.
export function reponses(xml) {
  const out = [];
  const src = String(xml).replace(/<!--[\s\S]*?-->/g, '');
  const re = /<([A-Za-z][\w.-]*:)?response(?=[\s>])[^>]*>([\s\S]*?)<\/\1?response\s*>/g;
  let m;
  while ((m = re.exec(src))) {
    const bloc = m[2];
    const avant = bloc.split(/<([A-Za-z][\w.-]*:)?propstat(?=[\s>])/)[0];
    const href = texte(avant, 'href');
    const props = {};
    const rp = /<([A-Za-z][\w.-]*:)?propstat(?=[\s>])[^>]*>([\s\S]*?)<\/\1?propstat\s*>/g;
    let p;
    while ((p = rp.exec(bloc))) {
      const statut = texte(p[2], 'status') || '';
      if (!/\s2\d\d\s/.test(` ${statut} `)) continue;
      const prop = element(p[2], 'prop') || '';
      for (const nom of ['displayname', 'resourcetype', 'supported-calendar-component-set', 'getctag', 'calendar-color', 'getetag', 'calendar-data', 'current-user-principal', 'calendar-home-set']) {
        const c = element(prop, nom);
        if (c != null) props[nom] = c;
      }
    }
    if (href) out.push({ href, props });
  }
  return out;
}
export const absolu = (href, base) => new URL(String(href).trim(), base).href;
// Premier href contenu dans une propriété (current-user-principal, calendar-home-set).
export function hrefDe(xml, nomProp, base) {
  for (const r of reponses(xml)) { const c = r.props[nomProp]; const h = c != null ? texte(c, 'href') : null; if (h) return absolu(h, base); }
  return null;
}
// Calendriers d'événements d'un dossier → [{ url, nom, couleur, ctag }].
export function calendriers(xml, base) {
  return reponses(xml).filter((r) => {
    const t = r.props.resourcetype || '';
    if (!/<([A-Za-z][\w.-]*:)?calendar(?=[\s/>])/.test(t)) return false;
    const comp = r.props['supported-calendar-component-set'];
    return comp == null || /name\s*=\s*["']VEVENT["']/i.test(comp);
  }).map((r) => ({ url: absolu(r.href, base), nom: entites(r.props.displayname || '').trim() || 'Calendrier', couleur: (entites(r.props['calendar-color'] || '').trim() || null), ctag: r.props.getctag != null ? entites(r.props.getctag).trim() : null }));
}
// Ressources d'un REPORT → [{ href, etag, ics }].
export function ressources(xml, base) {
  return reponses(xml).filter((r) => r.props['calendar-data'] != null).map((r) => ({ href: absolu(r.href, base), etag: entites(r.props.getetag || '').trim(), ics: entites(r.props['calendar-data']) }));
}

// ---------------------------------------------------------------------------
// Plan de synchronisation (iCloud ↔ table evenements)
// ---------------------------------------------------------------------------
// Champs comparés pour savoir si l'appli a modifié un événement depuis la dernière synchro.
const CHAMPS = ['titre', 'categorie', 'debut', 'fin', 'journee', 'lieu', 'notes', 'membres', 'recurrence', 'exceptions', 'source_uid'];
const iso = (v) => (v ? new Date(v).toISOString() : null);
// jsonb range les clés à sa façon : on les trie pour comparer.
const stable = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, stable(o[k])])) : o ?? null);
export function empreinte(lignes) {
  const norm = (r) => CHAMPS.map((k) => (k === 'debut' || k === 'fin' ? iso(r[k]) : k === 'membres' || k === 'exceptions' ? [...(r[k] || [])].sort() : k === 'recurrence' ? stable(r[k]) : r[k] ?? null));
  return JSON.stringify([...lignes].sort((a, b) => String(a.source_uid || a.id).localeCompare(String(b.source_uid || b.id))).map(norm));
}
const nomFichier = (id) => `${encodeURIComponent(id)}.ics`;
const uidAppli = new RegExp(`^([0-9a-f-]{36})@${DOMAINE_UID}$`, 'i');

// entree = {
//   distants: [{ href, etag, ics }]       ressources lues sur iCloud (fenêtre depuis → jusqu)
//   liens:    [{ href, etag, uid, evenement_ids, empreinte, brut }]   état de la dernière synchro
//   locaux:   [lignes evenements du foyer]
//   calendrier: url du calendrier iCloud, depuis: Date (début de la fenêtre), nouvelId: () => uuid
// }
// → { creer, maj, supprimer: [id], envoyer: [{ href, etag|null, ics, lien }], effacer: [{ href, etag }], liens: [lien], oublier: [href] }
export function planSynchro({ distants, liens, locaux, calendrier, depuis, jusqu = null, nouvelId, noms = {}, maintenant = new Date() }) {
  const fin = jusqu || new Date(+new Date(depuis) + 820 * 864e5);
  const plan = { creer: [], maj: [], supprimer: [], envoyer: [], effacer: [], liens: [], oublier: [] };
  const parId = new Map(locaux.map((r) => [r.id, r]));
  const lienDe = new Map(liens.map((l) => [l.href, l]));
  const vus = new Set(); // ids d'événements locaux rattachés à une ressource
  const distantsHref = new Set(distants.map((d) => d.href));
  const parSourceUid = new Map(locaux.filter((r) => r.source === 'icloud' && r.source_uid).map((r) => [r.source_uid, r]));

  for (const d of distants) {
    const lien = lienDe.get(d.href);
    let evs;
    try { evs = analyserIcs(d.ics).evenements; } catch { continue; }
    if (!evs.length) continue;
    const uid = evs.find((e) => !e.rid)?.uid || evs[0].uid;
    const lignesLien = (lien?.evenement_ids || []).map((id) => parId.get(id)).filter(Boolean);
    lignesLien.forEach((r) => vus.add(r.id));
    if (lien && lien.etag === d.etag) {
      // Inchangé sur iCloud : on envoie les modifications faites dans l'appli, ou on efface si tout a été supprimé ici.
      if (!lignesLien.length) { plan.effacer.push({ href: d.href, etag: d.etag }); plan.oublier.push(d.href); continue; }
      const e = empreinte(lignesLien);
      if (e !== lien.empreinte) plan.envoyer.push({ href: d.href, etag: d.etag, ics: ressource(lignesLien, { distant: d.ics, noms, maintenant }), lien: { ...lien, empreinte: e, brut: null } });
      continue;
    }
    // Nouveau ou modifié sur iCloud : iCloud fait foi.
    const appli = uid.match(uidAppli)?.[1];
    const ids = [];
    const resultat = [];
    for (const e of evs) {
      const { uid: _u, rid, cle, ...champs } = e;
      const sourceUid = !rid && appli ? null : cle;
      let local = lignesLien.find((r) => (r.source_uid || null) === sourceUid && (sourceUid || !String(r.source_uid || '').includes('#')))
        || (!rid && appli ? parId.get(appli) : null) || (sourceUid ? parSourceUid.get(sourceUid) : null);
      if (local && plan.maj.some((m) => m.id === local.id)) local = null;
      const ligne = { ...champs, source: local?.source ?? (sourceUid ? 'icloud' : null), source_uid: sourceUid };
      if (local) { const l = { ...local, ...ligne, id: local.id }; plan.maj.push(l); ids.push(local.id); resultat.push(l); vus.add(local.id); }
      else { const l = { ...ligne, id: nouvelId() }; plan.creer.push(l); ids.push(l.id); resultat.push(l); }
    }
    for (const r of lignesLien) if (!ids.includes(r.id)) plan.supprimer.push(r.id);
    plan.liens.push({ href: d.href, etag: d.etag, uid, evenement_ids: ids, empreinte: empreinte(resultat), brut: null });
  }

  // Ressources disparues d'iCloud : supprimées là-bas seulement si elles devaient être dans la fenêtre lue.
  // Sorties de la fenêtre (série finie, événement lointain) : rien ne change. Dans le doute (règle d'un autre
  // agenda que l'appli ne sait pas calculer) : on oublie le lien sans rien supprimer.
  for (const l of liens) {
    if (distantsHref.has(l.href)) continue;
    const lignes = (l.evenement_ids || []).map((id) => parId.get(id)).filter(Boolean);
    lignes.forEach((r) => vus.add(r.id));
    const etats = lignes.map((r) => dansFenetre(r, depuis, fin));
    if (!lignes.length || etats.includes(true)) { plan.supprimer.push(...lignes.map((r) => r.id)); plan.oublier.push(l.href); }
    else if (etats.includes(null)) plan.oublier.push(l.href);
  }

  // Événements créés dans l'appli, jamais envoyés : nouvelles ressources (seulement dans la fenêtre lue,
  // sinon la synchro suivante les croirait effacés sur iCloud).
  for (const r of locaux) {
    if (vus.has(r.id) || r.source) continue;
    if (dansFenetre(r, depuis, fin) !== true) continue;
    const href = absolu(nomFichier(r.id), calendrier.endsWith('/') ? calendrier : `${calendrier}/`);
    plan.envoyer.push({ href, etag: null, ics: ressource([r], { noms, maintenant }), lien: { href, uid: uidDe(r), evenement_ids: [r.id], empreinte: empreinte([r]), brut: null } });
  }
  return plan;
}
const isoJour = (d) => new Date(d).toISOString().slice(0, 10);
const JOUR_MS = 864e5;
const jourUtc = (iso) => Date.UTC(...iso.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)));
const versIso = (t) => new Date(t).toISOString().slice(0, 10);

// Dernier jour d'occurrence d'une série (« AAAA-MM-JJ », heure de Paris), COUNT compris ; Infinity si elle ne finit
// jamais ; null si on ne sait pas le calculer (règle d'un autre agenda sans date de fin). Jamais plus tard que la
// vraie dernière occurrence : « dans la fenêtre » reste donc une certitude.
export function dernierJour(r) {
  const rec = r.recurrence;
  const d0 = jourParis(r.debut);
  if (!rec) return d0;
  if (rec.jusqu) return rec.jusqu;
  if (!rec.nombre) return Infinity;
  if (rec.nonGere) return null;
  const n = Math.max(1, Math.floor(Number(rec.intervalle) || 1));
  const k = Math.max(1, Math.floor(rec.nombre)) - 1;
  const t0 = jourUtc(d0);
  const [a, m, j] = d0.split('-').map(Number);
  if (rec.freq === 'quotidienne') return versIso(t0 + k * n * JOUR_MS);
  // Mois ou années sans ce jour (31, 29 février) : sautés sans compter, la vraie fin ne peut qu'être plus tard.
  if (rec.freq === 'mensuelle') return versIso(Date.UTC(a, m - 1 + k * n, j));
  if (rec.freq === 'annuelle') return versIso(Date.UTC(a + k * n, m - 1, j));
  if (rec.freq === 'hebdo') {
    const jours = [...new Set((rec.jours?.length ? rec.jours : [((new Date(t0).getUTCDay() + 6) % 7) + 1]).map(Number))].filter((x) => x >= 1 && x <= 7).sort();
    const lundi = t0 - ((new Date(t0).getUTCDay() + 6) % 7) * JOUR_MS;
    let compte = 0;
    for (let w = 0; w < 100000; w++) {
      for (const x of jours) {
        const t = lundi + (w * 7 * n + x - 1) * JOUR_MS;
        if (t >= t0 && ++compte > k) return versIso(t);
      }
    }
  }
  return null;
}
// L'événement (ou une de ses occurrences) touche-t-il la fenêtre [depuis, jusqu] ? true / false / null (on ne sait pas).
export function dansFenetre(r, depuis, jusqu) {
  const premier = jourParis(r.debut);
  if (premier > jourParis(jusqu)) return false;
  if (!r.recurrence) return +new Date(r.fin || r.debut) >= +new Date(depuis);
  const dernier = dernierJour(r);
  if (dernier === null) return null;
  const duree = r.fin ? Math.max(0, Math.ceil((+new Date(r.fin) - +new Date(r.debut)) / JOUR_MS)) : 0;
  return dernier === Infinity || versIso(jourUtc(dernier) + duree * JOUR_MS) >= jourParis(depuis);
}

// Changement de calendrier iCloud : ce qui venait de l'ancien calendrier quitte l'agenda de la famille, et ce que
// l'appli y avait envoyé en est retiré (il sera renvoyé vers le nouveau calendrier à la synchro suivante).
// → { supprimer: [id] (lignes reçues d'iCloud), detacher: [id] (occurrences déplacées d'une série de l'appli : elles
//     redeviennent des événements de l'appli), effacer: [{ href, etag }] (ressources créées par l'appli) }
export function planChangement({ liens, locaux }) {
  const parId = new Map(locaux.map((r) => [r.id, r]));
  const out = { supprimer: [], detacher: [], effacer: [] };
  for (const l of liens) {
    const appli = uidAppli.test(String(l.uid || ''));
    if (appli) out.effacer.push({ href: l.href, etag: l.etag || null });
    for (const id of l.evenement_ids || []) {
      const r = parId.get(id);
      if (!r || r.source !== 'icloud') continue;
      if (appli) out.detacher.push(id); else out.supprimer.push(id);
    }
  }
  return out;
}
