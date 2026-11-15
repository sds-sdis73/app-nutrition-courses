// ---------------------------------------------------------------------------
// Module « Messages » : la discussion de la famille (texte, photo, réactions, lu / non lu), en temps réel
// (Supabase realtime), notification aux autres comptes du foyer (fonction messages-notifier), saisies
// hors ligne mises en file. Ce fichier porte aussi les outils partagés avec le module « Photos »
// (couche Stockage, réduction des images, noms des comptes), transmis par Modules.get('messages').service.
// Les fichiers passent par la couche « Stockage » (Supabase Storage aujourd'hui, Cloudflare R2 plus tard).
// Migration : supabase/migrations/2026-11-16_messages-photos.sql.
// ---------------------------------------------------------------------------

// ===== 1. Outils purs (exposés aux tests unitaires) =====================================
const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS_NOMS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🐶'];

// Taille réduite d'une image : le plus grand côté ne dépasse pas max (jamais d'agrandissement).
function dimensions(l, h, max) {
  const L = Math.max(1, Math.round(Number(l) || 1));
  const H = Math.max(1, Math.round(Number(h) || 1));
  const r = Math.min(1, max / Math.max(L, H));
  return { l: Math.max(1, Math.round(L * r)), h: Math.max(1, Math.round(H * r)) };
}
// Qualité JPEG suivante quand le fichier est encore trop lourd (descente plus franche si on est loin de la cible).
function qualiteSuivante(taille, cible, q) {
  const pas = taille > cible * 2 ? 0.15 : 0.07;
  return Math.max(0.45, Math.round((q - pas) * 100) / 100);
}
const deuxChiffres = (n) => String(n).padStart(2, '0');
// 'AAAA-MM-JJ' d'un horodatage ISO, à l'heure locale.
const jourDe = (ts) => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : isoDate(d); };
const heureCourte = (ts) => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`; };
// Libellé d'un jour pour la discussion : « Aujourd'hui », « Hier », « lundi 19 octobre » (année si différente).
function jourLibelle(iso, aujourdhui = new Date()) {
  const d = isoToDate(iso);
  const auj = isoDate(aujourdhui);
  if (iso === auj) return 'Aujourd\'hui';
  if (iso === isoDate(addDays(aujourdhui, -1))) return 'Hier';
  const an = d.getFullYear() !== aujourdhui.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${JOURS_NOMS[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS_NOMS[d.getMonth()]}${an}`;
}
// Date d'une photo : « 12 octobre 2026 ».
function dateLongue(iso) {
  if (!iso) return '';
  const d = isoToDate(String(iso).slice(0, 10));
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS_NOMS[d.getMonth()]} ${d.getFullYear()}`;
}
// Messages groupés par jour ; « suite » : même auteur qu'au message précédent, moins de 5 minutes après.
function grouperMessages(liste, aujourdhui = new Date()) {
  const tries = [...liste].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const jours = [];
  let prec = null;
  for (const m of tries) {
    const j = jourDe(m.created_at);
    let g = jours[jours.length - 1];
    if (!g || g.jour !== j) { g = { jour: j, libelle: jourLibelle(j, aujourdhui), messages: [] }; jours.push(g); prec = null; }
    const suite = !!prec && prec.user_id === m.user_id && new Date(m.created_at) - new Date(prec.created_at) < 5 * 60000;
    g.messages.push({ ...m, suite });
    prec = m;
  }
  return jours;
}
// Messages des autres arrivés après le dernier passage du compte.
function nonLus(liste, moi, luJusqua) {
  return liste.filter((m) => m.user_id !== moi && (!luJusqua || String(m.created_at) > String(luJusqua)));
}
// Réactions d'un message : [{ emoji, n, moi }] dans l'ordre d'apparition.
function resumeReactions(reactions, moi) {
  const out = [];
  for (const r of reactions) {
    let x = out.find((o) => o.emoji === r.emoji);
    if (!x) { x = { emoji: r.emoji, n: 0, moi: false }; out.push(x); }
    x.n++;
    if (r.user_id === moi) x.moi = true;
  }
  return out;
}
// Comptes (autres que l'auteur) qui ont lu un message.
const lecteurs = (m, lus) => lus.filter((l) => l.user_id !== m.user_id && l.lu_jusqu_a && String(l.lu_jusqu_a) >= String(m.created_at)).map((l) => l.user_id);
// Aperçu d'un message sur une ligne.
function apercu(m, max = 80) {
  const t = String(m?.texte || '').replace(/\s+/g, ' ').trim();
  if (!t) return m?.photo ? '📷 Photo' : '';
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
// Liste de prénoms : « Antoine », « Antoine et Manon », « Antoine, Manon et Zoé ».
const listeNoms = (noms) => (noms.length < 2 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`);
// Chemin d'un fichier dans le stockage : <foyer>/<dossier>/<id>[-mini].jpg (le 1er dossier sert aux règles d'accès).
const cheminFichier = (foyerId, dossier, id, mini = false) => `${foyerId}/${dossier}/${id}${mini ? '-mini' : ''}.jpg`;
// ===== 2. Stockage des fichiers (abstraction) ===========================================
// Mémoire locale (IndexedDB) : miniatures déjà vues (lecture hors ligne) et fichiers en attente d'envoi.
const Local = {
  base: null,
  ouvrir() {
    if (this.base) return this.base;
    this.base = new Promise((resolve) => {
      try {
        const r = indexedDB.open('tt-fichiers', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('fichiers');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
    return this.base;
  },
  async op(mode, fn) {
    const b = await this.ouvrir();
    if (!b) return null;
    return new Promise((resolve) => {
      try {
        const tx = b.transaction('fichiers', mode);
        const req = fn(tx.objectStore('fichiers'));
        tx.oncomplete = () => resolve(req?.result ?? null);
        tx.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  },
  lire: (chemin) => Local.op('readonly', (s) => s.get(chemin)),
  mettre: (chemin, blob, attente) => Local.op('readwrite', (s) => s.put({ blob, attente: !!attente, t: Date.now() }, chemin)),
  retirer: (chemin) => Local.op('readwrite', (s) => s.delete(chemin)),
  cles: () => Local.op('readonly', (s) => s.getAllKeys()),
};

// Fournisseur actuel : Supabase Storage, bucket privé « famille », adresses signées d'une heure.
// Pour passer à Cloudflare R2 : écrire un objet de même forme (deposer, adresses, supprimer) et le brancher ci-dessous.
const FournisseurSupabase = {
  bucket: 'famille',
  async deposer(chemin, blob) {
    const { error } = await db.storage.from(this.bucket).upload(chemin, blob, { contentType: blob.type || 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (error) throw error;
  },
  async adresses(chemins, duree = 3600) {
    const { data, error } = await db.storage.from(this.bucket).createSignedUrls(chemins, duree);
    if (error) throw error;
    return Object.fromEntries((data || []).filter((d) => d.signedUrl && d.path).map((d) => [d.path, d.signedUrl]));
  },
  async supprimer(chemins) {
    const { error } = await db.storage.from(this.bucket).remove(chemins);
    if (error) throw error;
  },
};

const Stockage = {
  fournisseur: FournisseurSupabase,
  signees: new Map(), // chemin → { url, fin }
  locales: new Map(), // chemin → URL d'objet (blob local)
  // Dépose un fichier ; hors ligne, il est gardé dans le téléphone et envoyé au retour du réseau.
  async deposer(chemin, blob, { garder = false } = {}) {
    try {
      await this.fournisseur.deposer(chemin, blob);
      if (garder) await Local.mettre(chemin, blob, false);
      return { attente: false };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      await Local.mettre(chemin, blob, true);
      return { attente: true };
    }
  },
  // Adresses affichables de plusieurs fichiers : blob local d'abord, sinon adresse signée (gardée 50 min).
  async adresses(chemins) {
    const out = {};
    const manquants = [];
    for (const c of new Set(chemins.filter(Boolean))) {
      if (this.locales.has(c)) { out[c] = this.locales.get(c); continue; }
      const s = this.signees.get(c);
      if (s && s.fin > Date.now()) { out[c] = s.url; continue; }
      manquants.push(c);
    }
    for (const c of [...manquants]) {
      const l = await Local.lire(c);
      if (l?.blob) { const u = URL.createObjectURL(l.blob); this.locales.set(c, u); out[c] = u; manquants.splice(manquants.indexOf(c), 1); }
    }
    if (manquants.length && navigator.onLine) {
      try {
        const r = await this.fournisseur.adresses(manquants);
        for (const [c, u] of Object.entries(r)) { this.signees.set(c, { url: u, fin: Date.now() + 50 * 60000 }); out[c] = u; }
      } catch (e) { console.warn('stockage : adresses', e); }
    }
    return out;
  },
  // Miniature gardée dans le téléphone pour la revoir hors ligne.
  async garder(chemin, url) {
    try { const r = await fetch(url); if (r.ok) await Local.mettre(chemin, await r.blob(), false); } catch { /* sans gravité */ }
  },
  async supprimer(chemins) {
    const l = chemins.filter(Boolean);
    for (const c of l) { await Local.retirer(c); this.signees.delete(c); }
    if (!l.length) return;
    try { await this.fournisseur.supprimer(l); } catch (e) { if (!isNetworkError(e)) throw e; const f = cacheMsg.get('suppressions', []); cacheMsg.set('suppressions', [...f, ...l]); }
  },
  // Au retour du réseau : envoie les fichiers en attente et les suppressions différées.
  async rejouer() {
    let n = 0;
    for (const c of (await Local.cles()) || []) {
      const l = await Local.lire(c);
      if (!l?.attente) continue;
      try { await this.fournisseur.deposer(c, l.blob); await Local.mettre(c, l.blob, false); n++; } catch (e) { console.warn('stockage : envoi différé', e); if (isNetworkError(e)) break; }
    }
    const sup = cacheMsg.get('suppressions', []);
    if (sup.length) { try { await this.fournisseur.supprimer(sup); cacheMsg.set('suppressions', []); } catch { /* plus tard */ } }
    return n;
  },
};

// ===== 3. Images : réduction dans le téléphone ===========================================
async function lireImage(fichier) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(fichier, { imageOrientation: 'from-image' }); } catch { /* repli ci-dessous */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const u = URL.createObjectURL(fichier);
    img.onload = () => { URL.revokeObjectURL(u); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('Image illisible')); };
    img.src = u;
  });
}
const versBlob = (c, q) => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversion impossible'))), 'image/jpeg', q));
async function encoder(source, max, cible) {
  const { l, h } = dimensions(source.width, source.height, max);
  const c = document.createElement('canvas');
  c.width = l; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; // fond des images transparentes (le JPEG n'a pas de transparence)
  ctx.fillRect(0, 0, l, h);
  ctx.drawImage(source, 0, 0, l, h);
  let q = 0.85;
  let b = await versBlob(c, q);
  while (b.size > cible * 1.1 && q > 0.45) { q = qualiteSuivante(b.size, cible, q); b = await versBlob(c, q); }
  return { blob: b, l, h };
}
// Photo prête à envoyer : grande (1600 px, ~300 Ko) et miniature (480 px, ~40 Ko).
async function preparerImage(fichier) {
  const src = await lireImage(fichier);
  const grande = await encoder(src, 1600, 300 * 1024);
  const mini = await encoder(src, 480, 40 * 1024);
  src.close?.();
  return { grande: grande.blob, mini: mini.blob, l: grande.l, h: grande.h };
}
// Images d'un écran : les <img data-mp-src="chemin"> reçoivent leur adresse après l'affichage.
async function hydrater(racine = document) {
  const imgs = $$('img[data-mp-src]:not([src])', racine);
  if (!imgs.length) return;
  const urls = await Stockage.adresses(imgs.map((i) => i.dataset.mpSrc));
  for (const i of imgs) {
    const u = urls[i.dataset.mpSrc];
    if (!u) { i.closest('.mp-img')?.classList.add('mp-img-absente'); continue; }
    i.src = u;
    if (i.dataset.mpGarder && !u.startsWith('blob:')) Stockage.garder(i.dataset.mpSrc, u);
  }
}
const imgTag = (chemin, alt = '', { garder = true, cls = '' } = {}) => `<span class="mp-img ${cls}"><img data-mp-src="${esc(chemin)}" ${garder ? 'data-mp-garder="1"' : ''} alt="${esc(alt)}" loading="lazy" decoding="async"></span>`;

// ===== 4. Comptes et auteurs ============================================================
const cacheMsg = Modules.cache('messages');
let comptes = [];
function nomCompte(userId, repli = '') {
  const c = comptes.find((x) => x.user_id === userId) || (userId === me() ? state.compte : null);
  const m = c?.member_id ? memberById(c.member_id) : null;
  // Sans compte connu : le prénom noté sur ses messages.
  const signe = repli || M.liste.find((x) => x.user_id === userId && x.auteur)?.auteur;
  return m?.nom || signe || (c?.email ? c.email.split('@')[0] : '') || 'Quelqu\'un';
}
const monNom = () => nomCompte(me());
const initiale = (nom) => (String(nom || '?').trim()[0] || '?').toUpperCase();
async function chargerComptes() {
  const { data, error } = await db.from('foyer_comptes').select('user_id, member_id, email').eq('foyer_id', foyer());
  if (error) throw error;
  comptes = data || [];
  cacheMsg.set('comptes', comptes);
}
// Prévient les autres comptes du foyer (notification push), sans bloquer l'interface.
async function notifier(corps) {
  try { await db.functions.invoke('messages-notifier', { body: corps }); } catch (e) { console.warn('notification', e); }
}
const enFile = (table, id) => Queue.list().some((op) => op.table === table && op.row?.id === id);
// Identifiants d'une table encore dans la file d'attente (un seul passage pour tout un écran).
const idsEnFile = (table) => new Set(Queue.list().filter((op) => op.table === table && op.row?.id).map((op) => op.row.id));
const icMsg = I('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');
const icPhoto = I('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>');
const icEnvoi = I('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>');

// ===== 5. Messages ======================================================================
const M = { liste: [], reactions: [], lus: [], encore: false, vuJusqua: null, canal: null, marque: null };
const LIMITE = 150;
const monLu = () => M.lus.find((l) => l.user_id === me()) || null;
function sauverMessages() { cacheMsg.set('etat', { liste: M.liste.slice(-LIMITE), reactions: M.reactions, lus: M.lus }); }
function fusionner(liste, ligne) {
  const i = liste.findIndex((x) => x.id === ligne.id);
  if (i >= 0) liste[i] = { ...liste[i], ...ligne }; else liste.push(ligne);
}

async function chargerMessages(horsLigne) {
  if (horsLigne) {
    const c = cacheMsg.get('etat', null);
    comptes = cacheMsg.get('comptes', []);
    if (c) Object.assign(M, c);
    return;
  }
  await chargerComptes().catch((e) => { console.warn('comptes du foyer', e); comptes = cacheMsg.get('comptes', []); });
  const { data, error } = await db.from(T.mp_messages).select('*').eq('foyer_id', foyer()).order('created_at', { ascending: false }).limit(LIMITE);
  if (error) throw error;
  const liste = (data || []).reverse();
  const depuis = liste[0]?.created_at || new Date().toISOString();
  const [r, l] = await Promise.all([
    db.from(T.mp_reactions).select('*').eq('foyer_id', foyer()).gte('created_at', depuis),
    db.from(T.mp_lus).select('*').eq('foyer_id', foyer()),
  ]);
  if (r.error) throw r.error;
  if (l.error) throw l.error;
  // Les messages encore dans la file d'attente restent affichés.
  const attente = M.liste.filter((m) => enFile(T.mp_messages, m.id) && !liste.some((x) => x.id === m.id));
  M.liste = [...liste, ...attente];
  M.reactions = r.data || [];
  M.lus = l.data || [];
  M.encore = (data || []).length === LIMITE;
  sauverMessages();
  // Messages envoyés hors ligne et maintenant arrivés : on prévient les autres.
  const a = cacheMsg.get('a-notifier', []);
  const arrives = a.filter((id) => liste.some((x) => x.id === id));
  for (const id of arrives) notifier({ type: 'message', id });
  if (arrives.length) cacheMsg.set('a-notifier', a.filter((id) => !arrives.includes(id)));
  ecouter();
}
async function plusAnciens() {
  const premier = M.liste[0];
  if (!premier) return;
  const { data, error } = await db.from(T.mp_messages).select('*').eq('foyer_id', foyer()).lt('created_at', premier.created_at).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  const r = await db.from(T.mp_reactions).select('*').eq('foyer_id', foyer()).in('message_id', (data || []).map((x) => x.id));
  M.liste = [...(data || []).reverse(), ...M.liste];
  if (!r.error) for (const x of r.data || []) fusionner(M.reactions, x);
  M.encore = (data || []).length === 100;
}

// Temps réel : nouveaux messages, réactions et lectures des autres, sans recharger la page.
function ecouter() {
  if (M.canal || typeof db.channel !== 'function' || !foyer()) return;
  const filtre = `foyer_id=eq.${foyer()}`;
  const suivre = (table, liste) => (p) => {
    if (p.eventType === 'DELETE') { const id = p.old?.id; if (id) M[liste] = M[liste].filter((x) => x.id !== id); }
    else if (p.new?.id) fusionner(M[liste], p.new);
    sauverMessages();
    rafraichir(table === T.mp_messages && p.eventType === 'INSERT' && p.new?.user_id !== me());
  };
  try {
    M.canal = db.channel(`famille-${foyer()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: T.mp_messages, filter: filtre }, suivre(T.mp_messages, 'liste'))
      .on('postgres_changes', { event: '*', schema: 'public', table: T.mp_reactions, filter: filtre }, suivre(T.mp_reactions, 'reactions'))
      .on('postgres_changes', { event: '*', schema: 'public', table: T.mp_lus, filter: filtre }, suivre(T.mp_lus, 'lus'))
      .subscribe();
  } catch (e) { console.warn('temps réel', e); M.canal = null; }
}

// Pastille du nombre de messages non lus sur l'onglet Famille et le segment Messages.
function pastilles() {
  const n = nonLus(M.liste, me(), monLu()?.lu_jusqu_a).length;
  const poser = (el) => {
    if (!el) return;
    let p = $('.mp-pastille', el);
    if (!n) { p?.remove(); return; }
    if (!p) { p = document.createElement('span'); p.className = 'mp-pastille'; el.append(p); }
    p.textContent = n > 9 ? '9+' : String(n);
    p.setAttribute('aria-label', `${n} message${n > 1 ? 's' : ''} non lu${n > 1 ? 's' : ''}`);
  };
  poser($('.tabbar [data-tab="famille"]'));
  poser($('.segbar [data-tab="messages"]'));
}

// Après un changement : redessine le fil (sans toucher au champ de saisie) ou seulement les pastilles.
function rafraichir(nouveau = false) {
  const fil = $('#mp-fil');
  if (state.tab === 'messages' && fil) {
    const bas = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    fil.innerHTML = filHtml();
    hydrater(fil);
    if (bas || !nouveau) requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
    marquerLu();
  }
  pastilles();
}

// Marque la discussion comme lue (écran affiché, appli au premier plan).
function marquerLu() {
  clearTimeout(M.marque);
  M.marque = setTimeout(async () => {
    if (state.tab !== 'messages' || document.hidden) return;
    const dernier = M.liste.filter((m) => m.user_id !== me()).map((m) => m.created_at).sort().pop();
    const lu = monLu();
    if (!dernier || (lu && String(lu.lu_jusqu_a) >= String(dernier))) { pastilles(); return; }
    const ligne = { id: lu?.id || uid(), lu_jusqu_a: dernier };
    fusionner(M.lus, { ...ligne, user_id: me(), foyer_id: foyer() });
    pastilles();
    sauverMessages();
    try { await Sync.upsert(T.mp_lus, ligne, { onConflict: 'user_id' }); } catch (e) { console.warn('lu', e); }
  }, 700);
}

function bulle(m, { lus, attente }) {
  const moi = m.user_id === me();
  const nom = nomCompte(m.user_id, m.auteur);
  const reac = resumeReactions(M.reactions.filter((r) => r.message_id === m.id), me());
  const photo = m.photo?.chemin ? `<span class="mp-photo" role="button" tabindex="0" data-act="messages-photo" data-id="${m.id}" aria-label="Voir la photo" style="aspect-ratio:${Number(m.photo.l) || 4}/${Number(m.photo.h) || 3}">${imgTag(m.photo.mini || m.photo.chemin, 'Photo envoyée')}</span>` : '';
  const texte = m.texte ? `<div class="mp-texte">${esc(m.texte).replace(/ ([?!;»])/g, '\u202f$1').replace(/« /g, '«\u202f').replace(/\n/g, '<br>')}</div>` : '';
  const etat = !moi ? '' : (m._echec ? '<span class="mp-etat mp-echec">Non envoyé</span>'
    : attente.has(m.id) ? '<span class="mp-etat">En attente d\'envoi</span>'
      : lus.length ? `<span class="mp-etat">Lu par ${esc(listeNoms(lus.map((u) => nomCompte(u))))}</span>` : '');
  return `<div class="mp-msg ${moi ? 'mp-moi' : ''} ${m.suite ? 'mp-suite' : ''}" data-id="${m.id}">
    ${!moi ? `<span class="mp-avatar" aria-hidden="true">${m.suite ? '' : esc(initiale(nom))}</span>` : ''}
    <div class="mp-corps">
      ${!moi && !m.suite ? `<div class="mp-auteur">${esc(nom)}</div>` : ''}
      <button class="mp-bulle" data-act="messages-menu" data-id="${m.id}" aria-label="Message de ${esc(moi ? 'moi' : nom)} à ${heureCourte(m.created_at)} : options">${photo}${texte}<span class="mp-heure">${heureCourte(m.created_at)}</span></button>
      ${reac.length ? `<div class="mp-reacs">${reac.map((r) => `<button class="mp-reac" data-act="messages-reagir" data-id="${m.id}" data-emoji="${esc(r.emoji)}" aria-pressed="${r.moi}" aria-label="${esc(r.emoji)} ${r.n}">${esc(r.emoji)}${r.n > 1 ? ` <b>${r.n}</b>` : ''}</button>`).join('')}</div>` : ''}
      ${etat}
    </div></div>`;
}

function filHtml() {
  if (!M.liste.length) {
    return `<div class="empty mp-vide">${icMsg}<p><b>La discussion de la famille</b></p><p class="small">Un mot doux, une photo de Zoé, « qui prend le pain ? » : tout le foyer le voit ici.</p></div>`;
  }
  const lu = M.vuJusqua;
  let separe = false;
  // « Lu par » : seulement sous mon dernier message lu.
  const miens = M.liste.filter((m) => m.user_id === me());
  const dernierLu = [...miens].reverse().find((m) => lecteurs(m, M.lus).length);
  const attente = idsEnFile(T.mp_messages);
  return `${M.encore ? '<div class="mp-anciens"><button class="btn small" data-act="messages-anciens">Messages plus anciens</button></div>' : ''}
    ${grouperMessages(M.liste).map((g) => `<div class="mp-jour"><span>${esc(g.libelle)}</span></div>${g.messages.map((m) => {
    let sep = '';
    if (!separe && lu !== null && m.user_id !== me() && String(m.created_at) > String(lu || '')) { separe = true; sep = '<div class="mp-nouveaux"><span>Nouveaux messages</span></div>'; }
    return sep + bulle(m, { lus: m.id === dernierLu?.id ? lecteurs(m, M.lus) : [], attente });
  }).join('')}`).join('')}`;
}

function rendreMessages() {
  if (M.vuJusqua === null) M.vuJusqua = monLu()?.lu_jusqu_a || '';
  queueMicrotask(() => {
    hydrater($('#mp-fil') || document);
    pastilles();
    marquerLu();
    requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  });
  return `<section class="mp-discussion" aria-label="Discussion de la famille"><div id="mp-fil" class="mp-fil" aria-live="polite">${filHtml()}</div></section>
    <form class="mp-saisie" data-form="messages-envoyer" autocomplete="off">
      <label class="mp-joindre" aria-label="Joindre une photo" title="Joindre une photo">${icPhoto}<input type="file" accept="image/*" data-mp-joindre hidden></label>
      <div class="mp-champ"><div class="mp-piece" data-mp-piece hidden></div>
        <textarea class="input" name="texte" rows="1" maxlength="2000" placeholder="Écrire à la famille…" aria-label="Message"></textarea></div>
      <button class="mp-envoyer" aria-label="Envoyer">${icEnvoi}</button>
    </form>`;
}

let pieceJointe = null; // fichier choisi pour le prochain message
async function envoyer(texte, fichier) {
  const id = uid();
  const ligne = { id, texte: texte || null, photo: null, auteur: monNom(), created_at: new Date().toISOString() };
  const locale = { ...ligne, user_id: me(), foyer_id: foyer() };
  try {
    if (fichier) {
      const img = await preparerImage(fichier);
      const chemin = cheminFichier(foyer(), 'messages', id);
      const mini = cheminFichier(foyer(), 'messages', id, true);
      await Stockage.deposer(chemin, img.grande);
      await Stockage.deposer(mini, img.mini, { garder: true });
      ligne.photo = { chemin, mini, l: img.l, h: img.h };
      locale.photo = ligne.photo;
    }
    fusionner(M.liste, locale);
    rafraichir();
    const r = await Sync.upsert(T.mp_messages, ligne);
    fusionner(M.liste, r);
    sauverMessages();
    if (enFile(T.mp_messages, id)) cacheMsg.set('a-notifier', [...cacheMsg.get('a-notifier', []), id]);
    else notifier({ type: 'message', id });
    rafraichir();
  } catch (e) {
    fusionner(M.liste, { ...locale, _echec: true });
    rafraichir();
    fail(e, 'Message non envoyé');
  }
}

function montrerPiece(form) {
  const p = $('[data-mp-piece]', form);
  if (!p) return;
  if (!pieceJointe) { p.hidden = true; p.innerHTML = ''; return; }
  p.hidden = false;
  p.innerHTML = `<img src="${URL.createObjectURL(pieceJointe)}" alt="Photo jointe"><span class="grow small">Photo jointe</span><button type="button" class="icon-btn" data-act="messages-retirer-piece" aria-label="Retirer la photo">${ICON.close}</button>`;
}

function menuMessage(id) {
  const m = M.liste.find((x) => x.id === id);
  if (!m) return;
  const moi = m.user_id === me();
  const el = openSheet(`${sheetHead(moi ? 'Mon message' : `Message de ${nomCompte(m.user_id, m.auteur)}`)}
    <div class="mp-emojis" role="group" aria-label="Réagir">${EMOJIS.map((e) => `<button class="mp-emoji" data-x="reagir" data-emoji="${e}" aria-label="Réagir ${e}">${e}</button>`).join('')}</div>
    <div class="menu-list">
      ${m.texte ? `<button class="btn block" data-x="copier">${ICON.copy} Copier le texte</button>` : ''}
      ${m._echec ? `<button class="btn block" data-x="renvoyer">${icEnvoi} Renvoyer</button>` : ''}
      ${moi ? `<button class="btn block danger" data-x="suppr">${ICON.trash} Supprimer le message</button>` : ''}
    </div>
    <p class="muted small">${esc(dateLongue(jourDe(m.created_at)))} à ${heureCourte(m.created_at)}</p>`);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    if (b.dataset.x === 'reagir') { closeSheet(); reagir(id, b.dataset.emoji); }
    if (b.dataset.x === 'copier') { try { await navigator.clipboard.writeText(m.texte); toast('Texte copié'); } catch { toast('Copie impossible'); } closeSheet(); }
    if (b.dataset.x === 'renvoyer') { closeSheet(); M.liste = M.liste.filter((x) => x.id !== id); envoyer(m.texte, null); }
    if (b.dataset.x === 'suppr') {
      closeSheet();
      if (!(await confirmSheet('Supprimer ce message pour toute la famille ?', 'Supprimer'))) return;
      try {
        await Sync.supprimer(T.mp_messages, id);
        M.liste = M.liste.filter((x) => x.id !== id);
        M.reactions = M.reactions.filter((r) => r.message_id !== id);
        sauverMessages();
        if (m.photo) Stockage.supprimer([m.photo.chemin, m.photo.mini]).catch((err) => console.warn(err));
        rafraichir();
        toast('Message supprimé');
      } catch (err) { fail(err); }
    }
  });
}

async function reagir(id, emoji) {
  const mienne = M.reactions.find((r) => r.message_id === id && r.user_id === me() && r.emoji === emoji);
  try {
    if (mienne) {
      M.reactions = M.reactions.filter((r) => r !== mienne);
      rafraichir();
      await Sync.supprimer(T.mp_reactions, mienne.id);
    } else {
      const ligne = { id: uid(), message_id: id, emoji, created_at: new Date().toISOString() };
      M.reactions.push({ ...ligne, user_id: me(), foyer_id: foyer() });
      rafraichir();
      fusionner(M.reactions, await Sync.upsert(T.mp_reactions, ligne));
    }
    sauverMessages();
  } catch (e) { fail(e, 'Réaction non enregistrée'); }
}

async function voirPhotoMessage(id) {
  const m = M.liste.find((x) => x.id === id);
  if (!m?.photo) return;
  const el = openSheet(`${sheetHead(`Photo de ${m.user_id === me() ? 'moi' : nomCompte(m.user_id, m.auteur)}`)}
    <div class="mp-visu">${imgTag(m.photo.chemin, 'Photo envoyée dans la discussion', { garder: false })}</div>
    <p class="muted small">${esc(jourLibelle(jourDe(m.created_at)))} à ${heureCourte(m.created_at)}</p>
    <button class="btn block" data-x="album">${icPhoto} Ajouter à l'album de famille</button>`, { full: true });
  hydrater(el);
  el.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-x="album"]')) return;
    try {
      // La photo est reprise dans l'album (même fichier : aucun nouvel envoi).
      const album = Modules.get('photos')?.service;
      if (!album) return;
      await album.depuisMessage({ chemin: m.photo.chemin, miniature: m.photo.mini, largeur: m.photo.l, hauteur: m.photo.h, legende: m.texte ? apercu(m, 120) : null, prise_le: jourDe(m.created_at) });
      closeSheet();
      toast('Photo ajoutée à l\'album');
    } catch (err) { fail(err); }
  });
}

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.dataset?.form !== 'messages-envoyer') return;
  e.preventDefault();
  const texte = f.texte.value.trim();
  const fichier = pieceJointe;
  if (!texte && !fichier) return;
  f.texte.value = '';
  f.texte.style.height = '';
  pieceJointe = null;
  montrerPiece(f);
  envoyer(texte, fichier);
  f.texte.focus();
});
document.addEventListener('keydown', (e) => {
  // Entrée envoie (sur ordinateur) ; Maj + Entrée passe à la ligne.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.matches?.('[data-form="messages-envoyer"] textarea') && !/iPhone|iPad|Android/.test(navigator.userAgent)) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches?.('[data-form="messages-envoyer"] textarea')) { t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 140)}px`; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) M.vuJusqua = null; else if (state.tab === 'messages') marquerLu(); });
// En quittant la discussion, le repère « Nouveaux messages » sera recalculé à la prochaine visite.
document.addEventListener('click', (e) => { const b = e.target.closest?.('[data-act="tab"]'); if (b && b.dataset.tab !== 'messages') M.vuJusqua = null; }, true);

Modules.register({
  id: 'messages',
  onglet: 'famille',
  segment: 'Messages',
  ordre: 30,
  libelle: 'Messages',
  tables: { mp_messages: 'messages_famille', mp_reactions: 'messages_reactions', mp_lus: 'messages_lus' },
  async charger(force, { horsLigne } = {}) {
    await chargerMessages(horsLigne);
    if (!horsLigne) Stockage.rejouer().catch((e) => console.warn('stockage', e));
    pastilles();
    if (state.tab === 'messages' && state.loaded) render();
  },
  rendu: rendreMessages,
  actions: {
    'messages-menu': (b) => menuMessage(b.dataset.id),
    'messages-reagir': (b) => reagir(b.dataset.id, b.dataset.emoji),
    'messages-photo': (b) => voirPhotoMessage(b.dataset.id),
    'messages-anciens': async () => { try { await plusAnciens(); rafraichir(); window.scrollTo({ top: 0 }); } catch (e) { fail(e); } },
    'messages-retirer-piece': (b) => { pieceJointe = null; montrerPiece(b.closest('form')); },
  },
  sourcesAccueil: () => {
    const l = nonLus(M.liste, me(), monLu()?.lu_jusqu_a);
    if (!l.length) return [];
    const der = l[l.length - 1];
    const nom = nomCompte(der.user_id, der.auteur);
    const auj = jourDe(der.created_at) === isoDate(new Date());
    return [{ heure: auj ? heureCourte(der.created_at) : null, titre: l.length === 1 ? `Nouveau message de ${nom}` : `${l.length} messages non lus`, detail: `${nom} : ${apercu(der, 60)}`, icone: icMsg, act: 'tab', data: { tab: 'messages' }, priorite: 2 }];
  },
  notifications: [{ type: 'messages', libelle: 'Nouveaux messages', description: 'Quand quelqu\'un écrit dans la discussion de la famille.' }],
  expose: { grouperMessages, nonLus, resumeReactions, lecteurs, apercu, jourLibelle, heureCourte, listeNoms },
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches?.('[data-mp-joindre]') && t.files?.[0]) { pieceJointe = t.files[0]; montrerPiece(t.closest('form')); t.value = ''; $('[data-form="messages-envoyer"] textarea')?.focus(); }
});

// Outils partagés avec le module « Photos » (même couche de stockage, mêmes images, mêmes noms).
Modules.get('messages').service = {
  Stockage, preparerImage, hydrater, imgTag, nomCompte, monNom, notifier, enFile, idsEnFile, fusionner,
  cheminFichier, dateLongue, listeNoms, jourDe, deuxChiffres, MOIS_NOMS, dimensions, qualiteSuivante, icPhoto,
  messages: () => M.liste,
};
