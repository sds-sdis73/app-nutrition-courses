// CalDAV (iCloud) : corps des requêtes, lecture des réponses « multistatus » et plan de synchronisation.
// Fonctions pures (sans réseau), utilisées par la fonction agenda-synchro et vérifiées par tests/unit/agenda-synchro.test.js.
// Deno n'a pas de DOMParser : les réponses XML sont lues par expressions régulières, quel que soit le préfixe d'espace de noms.
import { analyserIcs, ressource, uidDe, DOMAINE_UID } from './ics.js';

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
export function planSynchro({ distants, liens, locaux, calendrier, depuis, nouvelId, noms = {}, maintenant = new Date() }) {
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

  // Ressources disparues d'iCloud : supprimées là-bas, sauf si elles sont simplement sorties de la fenêtre.
  for (const l of liens) {
    if (distantsHref.has(l.href)) continue;
    const lignes = (l.evenement_ids || []).map((id) => parId.get(id)).filter(Boolean);
    lignes.forEach((r) => vus.add(r.id));
    const dansFenetre = lignes.some((r) => (r.recurrence ? !r.recurrence.jusqu || r.recurrence.jusqu >= isoJour(depuis) : +new Date(r.fin || r.debut) >= +depuis));
    if (!lignes.length || dansFenetre) { plan.supprimer.push(...lignes.map((r) => r.id)); plan.oublier.push(l.href); }
  }

  // Événements créés dans l'appli, jamais envoyés : nouvelles ressources.
  for (const r of locaux) {
    if (vus.has(r.id) || r.source) continue;
    const actuel = r.recurrence ? !r.recurrence.jusqu || r.recurrence.jusqu >= isoJour(depuis) : +new Date(r.fin || r.debut) >= +depuis;
    if (!actuel) continue;
    const href = absolu(nomFichier(r.id), calendrier.endsWith('/') ? calendrier : `${calendrier}/`);
    plan.envoyer.push({ href, etag: null, ics: ressource([r], { noms, maintenant }), lien: { href, uid: uidDe(r), evenement_ids: [r.id], empreinte: empreinte([r]), brut: null } });
  }
  return plan;
}
const isoJour = (d) => new Date(d).toISOString().slice(0, 10);
