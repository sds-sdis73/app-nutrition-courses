// ---------------------------------------------------------------------------
// Module « Univers, sécurité, partage du sport, sauvegarde ».
// Un seul fichier pour quatre écrans qui partagent la ligne de préférences du compte (table compte_preferences) :
//   - univers        Plus › Univers : 5 univers graphiques + Classique, choisis par chaque compte ;
//   - securite       Plus › Sécurité : verrouillage Face ID (clé d'accès WebAuthn) + code de secours ;
//   - sauvegarde     Plus › Sauvegarde : toutes les données du foyer en un fichier JSON, rappel mensuel ;
//   - univers-securite  partage « tout ou rien » du sport, réglé dans Forme › Réglages,
//                    séances partagées dans l'agenda familial.
// Styles : src/css/modules/univers-securite.css. Migration : supabase/migrations/2026-11-16_univers-securite.sql.
// ---------------------------------------------------------------------------
const cache = Modules.cache('univers-securite');
const TABLE_ABSENTE = (e) => ['42P01', 'PGRST205', 'PGRST202', 'PGRST200'].includes(e?.code) || /does not exist|Could not find the table|schema cache/i.test(e?.message || '');
const COLONNES_PREFS = ['id', 'user_id', 'foyer_id', 'univers', 'partage_sport', 'sauvegarde_le', 'updated_at'];
const ICO_VERROU = I('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>');
const ICO_VISAGE = I('<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9v4h-1M9.5 16a3.5 3.5 0 0 0 5 0"/>');
const ICO_EFFACER = I('<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m17 9-6 6M11 9l6 6"/>');
const ICO_PALETTE = I('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.8-9-7.8z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15.5" cy="7.5" r="1"/>');
const ICO_COURSE = I('<circle cx="14" cy="4.5" r="1.8"/><path d="m7 21 3-6 3 2v4M6 12l3-4 4 1 2 3 3 1"/>');

// ---------------------------------------------------------------------------
// Préférences du compte (une ligne par compte, lisible et modifiable par lui seul)
// ---------------------------------------------------------------------------
const Prefs = {
  ligne: null,
  dispo: null, // false : la table n'existe pas encore sur le serveur (migration à appliquer)
  cle: () => `prefs-compte:${me() || 'x'}`,
  lire() { return this.ligne || store.get(this.cle(), null) || {}; },
  // Ne garde que les colonnes de la table (le cache local porte aussi le marqueur « à envoyer »).
  colonnes: (l) => Object.fromEntries(Object.entries(l).filter(([k]) => COLONNES_PREFS.includes(k))),
  async charger({ horsLigne } = {}) {
    if (!me()) return;
    const local = store.get(this.cle(), null);
    if (horsLigne) { this.ligne = local; return; }
    const { data, error } = await db.from(T.compte_preferences).select('*').eq('user_id', me()).limit(1);
    if (error) {
      this.ligne = local;
      if (TABLE_ABSENTE(error)) { this.dispo = false; return; }
      if (isNetworkError(error)) return;
      throw error;
    }
    this.dispo = true;
    const serveur = data?.[0] || null;
    if (local?.aEnvoyer) {
      // Choix faits hors ligne ou avant la migration : ils l'emportent sur le serveur.
      this.ligne = { ...(serveur || {}), ...local };
      await this.envoyer().catch((e) => console.warn('préférences', e));
    } else this.ligne = serveur || local;
    store.set(this.cle(), this.ligne);
  },
  async envoyer() {
    const r = await Sync.upsert(T.compte_preferences, this.colonnes({ ...this.ligne, user_id: me(), foyer_id: foyer() }), { onConflict: 'user_id' });
    this.ligne = { ...r };
    store.set(this.cle(), this.ligne);
  },
  async enregistrer(patch) {
    this.ligne = { ...this.lire(), ...patch, updated_at: new Date().toISOString() };
    if (this.dispo !== true) { this.ligne.aEnvoyer = true; store.set(this.cle(), this.ligne); return this.ligne; }
    store.set(this.cle(), this.ligne);
    try { await this.envoyer(); } catch (e) {
      if (!TABLE_ABSENTE(e)) throw e;
      this.dispo = false;
      this.ligne.aEnvoyer = true;
      store.set(this.cle(), this.ligne);
    }
    return this.ligne;
  },
};

// ---------------------------------------------------------------------------
// (1) Univers graphiques
// ---------------------------------------------------------------------------
const UNIVERS = [
  { id: 'classique', nom: 'Classique', famille: 'Pop gourmand', fond: '#fff3d1', polices: 'Baloo+2:wght@600;700;800&family=Nunito:wght@500;600;700;800',
    texte: 'Vanille, fraise et mangue, contours épais et boutons en relief : l\'appli telle que tu la connais.', policesNoms: 'Baloo 2 et Nunito',
    ideal: 'garder ses repères.' },
  { id: 'carnet', nom: 'Carnet de bord', famille: 'Papeterie · bullet journal', fond: '#FAFAF6', polices: 'Gochi+Hand&family=Atkinson+Hyperlegible:wght@400;700',
    texte: 'La semaine s\'écrit comme dans un carnet à spirale : papier pointé, stylo bille bleu, surligneur jaune et bouts de ruban adhésif.', policesNoms: 'Gochi Hand et Atkinson Hyperlegible',
    ideal: 'les listes, les cases à cocher, l\'agenda tenu à la main.' },
  { id: 'washi', nom: 'Washi', famille: 'Japonais minimal', fond: '#F3F2EE', polices: 'Shippori+Mincho:wght@600&family=Zen+Kaku+Gothic+New:wght@400;500;700',
    texte: 'Beaucoup de vide, des filets fins, l\'encre noire et un seul rouge vermillon. L\'écran se fait oublier et laisse la journée respirer.', policesNoms: 'Shippori Mincho et Zen Kaku Gothic New',
    ideal: 'le calme et peu de couleur ; très lisible, très net.' },
  { id: 'herbier', nom: 'Herbier', famille: 'Nature et botanique', fond: '#E9EEDF', polices: 'Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600&family=Karla:wght@400;600;700',
    texte: 'Feuilles pressées, verts de sous-bois et une touche de baie, avec des cartes en forme de feuille. Doux et vivant, comme un carnet de cueillette.', policesNoms: 'Fraunces et Karla',
    ideal: 'la cuisine, les courses et la forme ; apaisant.' },
  { id: 'cocon', nom: 'Cocon', famille: 'Doux pastel · cocooning', fond: '#FCEFEA', polices: 'Fredoka:wght@500;600&family=Nunito:wght@400;600;700;800',
    texte: 'Pêche, menthe et bleu poudré, formes très arrondies et ombres floues comme un plaid. Tout paraît moelleux.', policesNoms: 'Fredoka et Nunito',
    ideal: 'le fil de la journée, le compagnon, les soirées ; doux pour les yeux.' },
  { id: 'kermesse', nom: 'Kermesse', famille: 'Maximaliste coloré', fond: '#FFE6EE', polices: 'Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800',
    texte: 'Confettis, contours épais, ombres décalées en couleur et une typo grasse qui claque. On lit le planning comme une affiche de fête.', policesNoms: 'Bricolage Grotesque',
    ideal: 'l\'agenda familial et les couleurs ; les enfants adorent.' },
];
const universDe = (id) => UNIVERS.find((u) => u.id === id) || UNIVERS[0];
const universValide = (id) => UNIVERS.some((u) => u.id === id);
const policesUrl = (u) => `https://fonts.googleapis.com/css2?family=${u.polices}&display=swap`;
const universActuel = () => universDe(document.documentElement?.dataset?.univers || 'classique').id;

// Ajoute une seule fois la feuille Google Fonts d'un univers (hors ligne : les polices de secours prennent le relais).
function chargerPolices(u) {
  if (u.id === 'classique' || !document.head) return;
  const id = `us-polices-${u.id}`;
  if (document.getElementById?.(id)) return;
  const l = document.createElement('link');
  l.id = id; l.rel = 'stylesheet'; l.href = policesUrl(u);
  document.head.append(l);
}
function appliquerUnivers(id) {
  const u = universDe(id);
  const html = document.documentElement;
  if (u.id === 'classique') delete html.dataset.univers; else html.dataset.univers = u.id;
  chargerPolices(u);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', u.fond);
  store.set('univers', u.id); // affichage immédiat au prochain lancement, avant la connexion
  return u.id;
}
// Dès le chargement du script : le dernier univers connu sur cet appareil, sans attendre le réseau.
appliquerUnivers(store.get('univers', 'classique'));

const vignette = (u, actuel) => `<li><button type="button" class="us-apercu" data-uapercu="${u.id}" data-act="univers-choisir" data-id="${u.id}" aria-pressed="${u.id === actuel}" aria-label="Univers ${esc(u.nom)}${u.id === actuel ? ' (choisi)' : ''}">
  <span class="us-apercu-nom">${esc(u.nom)}</span>
  <span class="us-apercu-carte"><span class="us-apercu-points"><i></i><i></i><i></i></span><span class="us-apercu-ligne"></span></span>
  <span class="us-apercu-famille">${esc(u.famille)}</span>
  ${u.id === actuel ? '<span class="us-choisi">Choisi</span>' : '<span class="us-apercu-bouton">Choisir</span>'}</button></li>`;

function renduUnivers() {
  UNIVERS.forEach(chargerPolices); // les vignettes montrent chaque univers avec ses polices
  const actuel = universActuel();
  const u = universDe(actuel);
  return `<p class="muted" style="margin:0 0 12px">Chacun choisit le sien : ton univers ne change que <b>ton</b> affichage, et te suit sur tes appareils.</p>
    <ul class="us-grille">${UNIVERS.map((x) => vignette(x, actuel)).join('')}</ul>
    <section class="card us-detail" aria-live="polite"><h3>${esc(u.nom)}</h3><p>${esc(u.texte)}</p>
      <p class="muted small">Polices : ${esc(u.policesNoms)}. Idéal pour ${esc(u.ideal)}</p>
      ${Prefs.dispo === false ? '<p class="muted small">Choix gardé sur cet appareil ; il suivra ton compte après la prochaine mise à jour du serveur.</p>' : ''}</section>`;
}

// ---------------------------------------------------------------------------
// (2) Sécurité : verrouillage par Face ID (clé d'accès WebAuthn de l'appareil) et code de secours
// ---------------------------------------------------------------------------
const SECU = { config: 'securite:appareil', cacheLe: 'securite:cache-le', echecs: 'securite:echecs' };
const DELAIS = [[0, 'Immédiatement'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes']];
const ITERATIONS = 150000;
const configSecu = () => store.get(SECU.config, null);
const secuActive = () => { const c = configSecu(); return !!(c?.actif && (!me() || c.user === me())); };

// --- Fonctions pures (tests unitaires) ---
const octetsEnHex = (o) => [...o].map((x) => x.toString(16).padStart(2, '0')).join('');
const hexEnOctets = (h) => new Uint8Array((String(h).match(/../g) || []).map((x) => parseInt(x, 16)));
// Base64 « URL » (identifiant de la clé d'accès), sans dépendre de btoa/atob.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64url(buf) {
  const o = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < o.length; i += 3) {
    const n = (o[i] << 16) | ((o[i + 1] || 0) << 8) | (o[i + 2] || 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < o.length ? B64[(n >> 6) & 63] : '') + (i + 2 < o.length ? B64[n & 63] : '');
  }
  return s;
}
function deB64url(s) {
  const v = String(s).replace(/=+$/, '').split('').map((c) => B64.indexOf(c));
  const out = [];
  for (let i = 0; i < v.length; i += 4) {
    const n = (v[i] << 18) | (v[i + 1] << 12) | ((v[i + 2] > -1 ? v[i + 2] : 0) << 6) | (v[i + 3] > -1 ? v[i + 3] : 0);
    out.push((n >> 16) & 255);
    if (i + 2 < v.length) out.push((n >> 8) & 255);
    if (i + 3 < v.length) out.push(n & 255);
  }
  return new Uint8Array(out);
}
// Code de secours : 4 à 6 chiffres, ni répété (0000), ni en suite (1234, 9876). Renvoie un message, ou null si le code convient.
function codeRefuse(code) {
  const c = String(code ?? '');
  if (!/^\d{4,6}$/.test(c)) return 'Le code compte de 4 à 6 chiffres.';
  if (/^(\d)\1+$/.test(c)) return 'Évite un code fait d\'un seul chiffre répété.';
  const d = c.split('').map(Number);
  const suite = (pas) => d.every((x, i) => i === 0 || x === (d[i - 1] + pas + 10) % 10);
  if (suite(1) || suite(-1)) return 'Évite une suite de chiffres comme 1234.';
  return null;
}
// Empreinte PBKDF2-SHA-256 du code (sel aléatoire propre à l'appareil) : le code lui-même n'est jamais stocké.
async function hacherCode(code, selHex, iterations = ITERATIONS) {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexEnOctets(selHex), iterations }, cle, 256);
  return octetsEnHex(new Uint8Array(bits));
}
// Après 5 essais manqués : 30 s d'attente, puis le double à chaque nouvel échec (15 min au plus).
const attenteApresEchecs = (n) => (n < 5 ? 0 : Math.min(15 * 60000, 30000 * 2 ** (n - 5)));
// Faut-il verrouiller en revenant dans l'appli ?
function doitVerrouiller({ actif, cacheLe, maintenant, delaiMin = 5 }) {
  if (!actif || !cacheLe) return false;
  return maintenant - cacheLe >= delaiMin * 60000;
}
// Données d'authentificateur WebAuthn : octet 32 = drapeaux ; 0x01 présence (UP), 0x04 identité vérifiée (UV, Face ID).
function uvVerifie(authData) {
  const o = authData instanceof Uint8Array ? authData : new Uint8Array(authData || []);
  return o.length >= 37 && (o[32] & 0x05) === 0x05;
}
const nomBio = (ua = navigator.userAgent) => (/iPhone|iPad|iPod/.test(ua) ? 'Face ID' : /Macintosh/.test(ua) ? 'Touch ID' : 'la reconnaissance biométrique');
const delaiTexte = (min) => (min === 0 ? 'dès que tu quittes l\'appli' : `après ${min} minute${min > 1 ? 's' : ''} hors de l'appli`);

// --- Appareil ---
const alea = (n) => crypto.getRandomValues(new Uint8Array(n));
let bioDispo = null;
async function bioDisponible() {
  try {
    bioDispo = !!(window.isSecureContext !== false && window.PublicKeyCredential && navigator.credentials
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { bioDispo = false; }
  return bioDispo;
}
async function creerCle() {
  const m = memberById(state.compte?.member_id);
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: alea(32), rp: { name: APP_NAME },
    user: { id: new TextEncoder().encode(me() || uid()), name: state.user?.email || 'compte', displayName: m?.nom || state.user?.email || APP_NAME },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000, attestation: 'none',
  } });
  if (!cred?.rawId) throw new Error('clé non créée');
  return b64url(cred.rawId);
}
async function verifierBio(cfg) {
  const cred = await navigator.credentials.get({ publicKey: {
    challenge: alea(32), allowCredentials: [{ type: 'public-key', id: deB64url(cfg.cred), transports: ['internal'] }],
    userVerification: 'required', timeout: 60000,
  } });
  if (!cred || !uvVerifie(cred.response?.authenticatorData)) throw new Error('identité non vérifiée');
  return true;
}
async function nouveauCode(code) {
  const sel = octetsEnHex(alea(16));
  return { hash: await hacherCode(code, sel), sel, iter: ITERATIONS, len: String(code).length };
}
const codeJuste = async (cfg, code) => !!cfg?.code && (await hacherCode(code, cfg.code.sel, cfg.code.iter)) === cfg.code.hash;
const sessionPresente = () => { try { for (let i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return true; } catch { /* stockage indisponible */ } return false; };

// --- Écran de verrouillage (au-dessus de tout, le reste de la page devient inerte) ---
const Verrou = {
  el: null,
  saisie: '',
  confirmeOubli: false,
  ouvert() { return !!this.el; },
  montrer(raison = 'ouverture') {
    const cfg = configSecu();
    if (!cfg?.actif || this.el) return;
    this.saisie = '';
    this.confirmeOubli = false;
    const el = document.createElement('div');
    el.className = 'us-verrou';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'us-verrou-titre');
    document.body.append(el);
    for (const x of document.body.children) if (x !== el) x.inert = true;
    document.documentElement.style.overflow = 'hidden';
    this.el = el;
    this.dessiner();
    el.addEventListener('click', (e) => this.clic(e));
    if (cfg.bio && raison !== 'manuel' && document.visibilityState === 'visible') setTimeout(() => this.bio(true), 250);
  },
  cacher() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    for (const x of document.body.children) x.inert = false;
    document.documentElement.style.overflow = '';
    store.set(SECU.cacheLe, null);
  },
  dessiner() {
    const cfg = configSecu();
    if (!this.el || !cfg) return;
    if (this.confirmeOubli) {
      this.el.innerHTML = `<div class="us-verrou-carte"><h2 id="us-verrou-titre">Code oublié ?</h2>
        <p>Pour ta sécurité, tu vas être déconnecté·e de cet appareil. Reconnecte-toi avec ton e-mail et ton mot de passe, puis réactive le verrouillage dans Plus › Sécurité.</p>
        <button class="btn primary" data-us="deconnecter">Me déconnecter</button><button class="btn" data-us="annuler">Annuler</button></div>`;
      return;
    }
    const len = cfg.code?.len || 4;
    const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'x'];
    this.el.innerHTML = `<div class="us-verrou-carte">
      <img class="us-verrou-logo" src="icon-192.png" alt="">
      <h2 id="us-verrou-titre">${esc(APP_NAME)} est verrouillée</h2>
      <p class="muted">${cfg.bio ? `Déverrouille avec ${esc(nomBio())} ou ton code.` : 'Saisis ton code pour continuer.'}</p>
      ${cfg.bio ? `<button class="btn primary" data-us="bio">${ICO_VISAGE} Déverrouiller avec ${esc(nomBio())}</button>` : ''}
      <div class="us-points" aria-hidden="true">${Array.from({ length: len }, (_, i) => `<i class="${i < this.saisie.length ? 'plein' : ''}"></i>`).join('')}</div>
      <p class="sr-only" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">${this.saisie.length} chiffre${this.saisie.length > 1 ? 's' : ''} sur ${len}</p>
      <div class="us-clavier">${touches.map((t) => (t === '' ? '<span class="us-touche vide"></span>'
        : t === 'x' ? `<button class="us-touche" data-us="effacer" aria-label="Effacer">${ICO_EFFACER}</button>`
          : `<button class="us-touche" data-us="chiffre" data-c="${t}">${t}</button>`)).join('')}</div>
      <p class="us-msg" data-msg role="alert"></p>
      <button class="btn small" data-us="oubli" style="width:auto">Code oublié ?</button></div>`;
  },
  message(t, secouer = false) {
    const m = this.el && $('[data-msg]', this.el);
    if (m) m.textContent = t;
    if (secouer) { const p = $('.us-points', this.el); p?.classList.remove('erreur'); void p?.offsetWidth; p?.classList.add('erreur'); }
  },
  async clic(e) {
    const b = e.target.closest('[data-us]');
    if (!b) return;
    const cfg = configSecu();
    const x = b.dataset.us;
    if (x === 'bio') return this.bio(false);
    if (x === 'oubli') { this.confirmeOubli = true; return this.dessiner(); }
    if (x === 'annuler') { this.confirmeOubli = false; return this.dessiner(); }
    if (x === 'deconnecter') {
      store.set(SECU.config, null);
      store.set(SECU.echecs, null);
      this.cacher();
      try { await db.auth.signOut({ scope: 'local' }); } catch (err) { console.warn('déconnexion', err); }
      return;
    }
    if (x === 'effacer') { this.saisie = this.saisie.slice(0, -1); return this.dessiner(); }
    if (x === 'chiffre') {
      const len = cfg?.code?.len || 4;
      if (this.saisie.length >= len) return;
      this.saisie += b.dataset.c;
      this.dessiner();
      if (this.saisie.length === len) await this.verifier(this.saisie);
    }
  },
  async verifier(code) {
    const cfg = configSecu();
    const ech = store.get(SECU.echecs, null) || { n: 0, t: 0 };
    const reste = ech.t + attenteApresEchecs(ech.n) - Date.now();
    if (reste > 0) { this.saisie = ''; this.dessiner(); this.message(`Trop d'essais : réessaie dans ${Math.ceil(reste / 1000)} s.`); return false; }
    if (await codeJuste(cfg, code)) { store.set(SECU.echecs, null); this.cacher(); return true; }
    const n = ech.n + 1;
    store.set(SECU.echecs, { n, t: Date.now() });
    this.saisie = '';
    this.dessiner();
    const attente = attenteApresEchecs(n);
    this.message(attente ? `Code incorrect. Patiente ${Math.round(attente / 1000)} s avant de réessayer.` : `Code incorrect${n >= 3 ? ` (encore ${5 - n} essai${5 - n > 1 ? 's' : ''} avant une pause)` : ''}.`, true);
    return false;
  },
  async bio(silencieux) {
    const cfg = configSecu();
    if (!cfg?.bio || !this.el) return;
    try { await verifierBio(cfg); store.set(SECU.echecs, null); this.cacher(); } catch (err) {
      if (!silencieux) this.message(`${nomBio()} n'a pas abouti : réessaie ou saisis ton code.`);
      console.warn('déverrouillage', err?.name || err);
    }
  },
};

// À l'ouverture : verrouillé avant même l'affichage des données (s'il reste une session sur l'appareil).
if (configSecu()?.actif && sessionPresente()) Verrou.montrer('ouverture');
// Au retour dans l'appli après le délai choisi (5 minutes par défaut).
function auRetour() {
  const cfg = configSecu();
  if (document.visibilityState === 'hidden') { if (cfg?.actif && !Verrou.ouvert()) store.set(SECU.cacheLe, Date.now()); return; }
  if (doitVerrouiller({ actif: secuActive() && !!state.user, cacheLe: store.get(SECU.cacheLe, null), maintenant: Date.now(), delaiMin: cfg?.delai ?? 5 })) Verrou.montrer('retour');
}
document.addEventListener('visibilitychange', auRetour);
window.addEventListener('pageshow', (e) => { if (e.persisted) auRetour(); });
// Déconnexion : plus rien à protéger, l'écran de connexion demande le mot de passe.
db.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT') Verrou.cacher(); });

function renduSecurite() {
  const cfg = configSecu();
  const actif = secuActive();
  if (bioDispo === null) bioDisponible().then(() => { if (state.tab === 'securite') render(); });
  const bio = nomBio();
  const info = `<section class="card us-carte"><h3>Bon à savoir</h3>
    <p class="muted small">Le verrouillage protège l'accès à l'appli sur ce téléphone ; ton compte garde son mot de passe. ${esc(bio)} reste dans le téléphone : l'appli reçoit seulement la réponse « c'est bien toi ».</p>
    <p class="muted small">Ton code de secours n'est jamais enregistré en clair : seule son empreinte chiffrée reste sur cet appareil. En cas d'oubli, tu te reconnectes avec ton mot de passe.</p></section>`;
  if (!actif) {
    return `<section class="card us-carte"><div class="us-etat"><span class="us-etat-ico">${ICO_VERROU}</span><div class="grow"><b>Verrouillage désactivé</b><br><span class="muted small">Sur cet appareil</span></div></div>
      <p>À l'ouverture, et quand tu reviens après 5 minutes, l'appli te demande ${esc(bio)} ou un code de secours à 4 à 6 chiffres.</p>
      ${bioDispo === false ? `<p class="muted small">${esc(bio.charAt(0).toUpperCase() + bio.slice(1))} n'est pas disponible dans ce navigateur : le verrouillage se fera avec ton code seul.</p>` : ''}
      <div class="us-actions"><button class="btn primary block" data-act="securite-activer">${ICO_VERROU} Activer le verrouillage</button></div></section>${info}`;
  }
  return `<section class="card us-carte"><div class="us-etat"><span class="us-etat-ico">${ICO_VERROU}</span><div class="grow"><b>Verrouillage activé</b><br>
      <span class="muted small">${cfg.bio ? `${esc(bio)} et code de secours` : 'Code de secours seul'} · ${esc(delaiTexte(cfg.delai ?? 5))}</span></div></div>
    <div class="us-actions">
      <button class="btn block" data-act="securite-verrouiller">Verrouiller maintenant</button>
      ${!cfg.bio && bioDispo ? `<button class="btn block" data-act="securite-bio">${ICO_VISAGE} Ajouter ${esc(bio)}</button>` : ''}
      <button class="btn block" data-act="securite-code">Changer le code de secours</button>
      <label class="field"><span>Redemander au retour dans l'appli</span><select class="input" data-securite-delai>${DELAIS.map(([v, l]) => `<option value="${v}" ${(cfg.delai ?? 5) === v ? 'selected' : ''}>${l === 'Immédiatement' ? l : `Après ${l}`}</option>`).join('')}</select></label>
      <button class="btn block danger" data-act="securite-desactiver">Désactiver le verrouillage</button>
    </div></section>${info}`;
}

// Feuille « code » : activation (nouveau code), changement (ancien + nouveau) ou désactivation (code actuel).
function feuilleCode(mode) {
  const cfg = configSecu();
  const bio = nomBio();
  const champ = (nom, libelle) => `<label class="field"><span>${libelle}</span><input class="input us-code" name="${nom}" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="off" required></label>`;
  const titres = { activer: 'Activer le verrouillage', changer: 'Changer le code de secours', desactiver: 'Désactiver le verrouillage' };
  const bouton = { activer: bioDispo ? `Continuer avec ${bio}` : 'Activer avec ce code', changer: 'Enregistrer le nouveau code', desactiver: 'Désactiver' }[mode];
  const el = openSheet(`${sheetHead(titres[mode])}
    <form class="stack" data-form="securite-${mode}">
      ${mode === 'activer' ? `<p class="muted small" style="margin:0">Choisis un code de secours de 4 à 6 chiffres. Il sert si ${esc(bio)} ne te reconnaît pas.</p>` : ''}
      ${mode !== 'activer' ? champ('actuel', 'Code actuel') : ''}
      ${mode !== 'desactiver' ? `${champ('c1', mode === 'changer' ? 'Nouveau code' : 'Code de secours')}${champ('c2', 'Confirme le code')}` : ''}
      <p class="us-msg" data-msg role="alert"></p>
      <button class="btn primary block" data-x="ok">${esc(bouton)}</button>
      ${mode === 'activer' ? '<button type="button" class="btn block" data-x="code-seul" hidden>Activer avec le code seul</button>' : ''}
    </form>`);
  const f = $('form', el);
  const msg = (t) => { $('[data-msg]', el).textContent = t; };
  let codeOk = null;
  const terminer = async (cred) => {
    const code = await nouveauCode(codeOk);
    const prec = configSecu();
    store.set(SECU.config, { actif: true, user: me(), cred: cred || null, bio: !!cred, code, delai: prec?.delai ?? 5, cree_le: new Date().toISOString() });
    store.set(SECU.echecs, null);
    closeSheet();
    render();
    toast(cred ? `Verrouillage activé avec ${bio}` : 'Verrouillage activé avec ton code');
  };
  $('[data-x="code-seul"]', el)?.addEventListener('click', () => terminer(null).catch(fail));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bt = $('[data-x="ok"]', el);
    bt.disabled = true;
    try {
      if (mode !== 'activer' && !(await codeJuste(cfg, f.actuel.value))) { msg('Code actuel incorrect.'); return; }
      if (mode === 'desactiver') { store.set(SECU.config, null); store.set(SECU.cacheLe, null); closeSheet(); render(); toast('Verrouillage désactivé'); return; }
      const refus = codeRefuse(f.c1.value);
      if (refus) { msg(refus); return; }
      if (f.c1.value !== f.c2.value) { msg('Les deux codes ne sont pas identiques.'); return; }
      codeOk = f.c1.value;
      if (mode === 'changer') {
        store.set(SECU.config, { ...cfg, code: await nouveauCode(codeOk) });
        closeSheet(); render(); toast('Code de secours changé');
        return;
      }
      if (!bioDispo) { await terminer(null); return; }
      try { await terminer(await creerCle()); } catch (err) {
        console.warn('clé d\'accès', err?.name || err);
        msg(`${bio} n'a pas été configuré. Réessaie, ou active le verrouillage avec ton code seul.`);
        bt.textContent = 'Réessayer';
        $('[data-x="code-seul"]', el).hidden = false;
      }
    } catch (err) { fail(err); } finally { bt.disabled = false; }
  });
  setTimeout(() => f.querySelector('input')?.focus(), 60);
  return el;
}

document.addEventListener('change', (e) => {
  if (e.target.matches?.('[data-securite-delai]')) {
    const cfg = configSecu();
    if (cfg) { store.set(SECU.config, { ...cfg, delai: Number(e.target.value) }); render(); toast('Délai enregistré'); }
  }
  if (e.target.matches?.('[data-partage-sport]')) basculerPartage(e.target).catch(fail);
  if (e.target.matches?.('[data-sauvegarde-rappel]')) { store.set(cleRappel(), e.target.checked); toast(e.target.checked ? 'Rappel mensuel activé' : 'Rappel mensuel désactivé'); }
});

// ---------------------------------------------------------------------------
// (3) Partage du sport « tout ou rien »
// ---------------------------------------------------------------------------
// Le serveur (RLS) ne renvoie les séances d'un autre compte que s'il a choisi de partager ;
// les siennes ne sont montrées à la famille (agenda) que si l'on partage soi-même.
const sport = { seances: [], debut: null, fin: null };
const TYPES_SEANCE = { course: 'Course', renfo: 'Renfo', cardio: 'Cardio', mobilite: 'Mobilité' };
const titreSeance = (s) => s.titre || s.prevu?.titre || FORME_COURSE[s.sous || s.prevu?.sous]?.label || FORME_COURSE[s.type]?.label || TYPES_SEANCE[s.type] || 'Séance';
function heureFin(heure, minutes) {
  if (!/^\d{2}:\d{2}$/.test(heure || '') || !(minutes > 0)) return null;
  const [h, m] = heure.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + Math.round(minutes));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
function seancesVisibles(seances, { moi, partageMoi }) {
  return (seances || []).filter((s) => s.statut !== 'rate' && (s.user_id !== moi || partageMoi));
}
function elementAgenda(s, nomDe = () => '') {
  const nom = nomDe(s.member_id);
  const bits = [nom, s.duree_min ? `${s.duree_min} min` : '', s.distance_m ? `${String(Math.round(s.distance_m / 100) / 10).replace('.', ',')} km` : '', s.statut === 'fait' ? 'faite' : ''].filter(Boolean);
  return { id: `seance:${s.id}`, date: s.date, heure: s.heure || null, heureFin: heureFin(s.heure, s.duree_min), titre: titreSeance(s), detail: bits.join(' · '),
    membres: s.member_id ? [s.member_id] : [], couleur: null, act: 'partage-sport-voir', data: { id: s.id } };
}
const partageMoi = () => !!Prefs.lire().partage_sport;
const COLONNES_SEANCE = 'id,member_id,user_id,date,heure,type,statut,duree_min,distance_m,dplus_m,titre:prevu->>titre,sous:prevu->>sous';
async function lireSeances(a, b) {
  const { data, error } = await db.from(T.forme_seances || 'forme_seances').select(COLONNES_SEANCE).eq('foyer_id', foyer()).gte('date', a).lte('date', b).order('date');
  if (error) { if (TABLE_ABSENTE(error)) return []; throw error; }
  return data || [];
}
async function chargerSport(horsLigne) {
  if (!foyer()) return;
  if (horsLigne) { Object.assign(sport, cache.get('sport', { seances: [], debut: null, fin: null })); return; }
  const debut = isoDate(addDays(new Date(), -42)), fin = isoDate(addDays(new Date(), 84));
  try { Object.assign(sport, { seances: await lireSeances(debut, fin), debut, fin }); cache.set('sport', sport); } catch (e) {
    if (!isNetworkError(e)) throw e;
    Object.assign(sport, cache.get('sport', sport));
  }
}
async function agendaSport(debut, fin) {
  const a = isoDate(debut), b = isoDate(fin);
  let liste = sport.seances;
  if (navigator.onLine && foyer() && (!sport.debut || a < sport.debut || b > sport.fin)) liste = await lireSeances(a, b).catch(() => sport.seances);
  const nomDe = (id) => memberById(id)?.nom || '';
  return seancesVisibles(liste, { moi: me(), partageMoi: partageMoi() }).filter((s) => s.date >= a && s.date <= b).map((s) => elementAgenda(s, nomDe));
}
const partageurs = () => [...new Set(sport.seances.filter((s) => s.user_id !== me()).map((s) => s.member_id))].map((id) => memberById(id)?.nom).filter(Boolean);

function cartePartage() {
  const oui = partageMoi();
  const autres = partageurs();
  return `<section class="card f-pad stack" data-partage-carte><h3>Partage avec la famille</h3>
    <label class="us-interrupteur"><input type="checkbox" data-partage-sport ${oui ? 'checked' : ''}><span><b>Partager tout mon sport</b></span></label>
    <p class="muted small" style="margin-top:4px">Tout ou rien : si tu partages, les membres du foyer voient tes séances (prévues et faites), ton plan de la semaine, tes objectifs et tes réglages Forme, en lecture seule. Personne ne peut les modifier. Tes mensurations restent privées. Tu peux changer d'avis à tout moment.</p>
    ${oui ? '<p class="small"><b>Partagé :</b> tes séances apparaissent dans l\'agenda de la famille.</p>' : '<p class="small"><b>Non partagé :</b> ton sport reste visible de toi seul·e.</p>'}
    ${autres.length ? `<p class="small">Partagent leur sport avec toi : <b>${autres.map(esc).join(', ')}</b>.</p>` : ''}
    ${Prefs.dispo === false ? '<p class="muted small">Le partage s\'activera après la prochaine mise à jour du serveur.</p>' : ''}</section>`;
}
async function basculerPartage(input) {
  const oui = input.checked;
  if (oui && !(await confirmSheet('Partager tout ton sport avec la famille ? Ils verront tes séances, ton plan et tes objectifs, sans pouvoir les modifier.', 'Partager', false))) { input.checked = false; return; }
  await Prefs.enregistrer({ partage_sport: oui });
  toast(oui ? 'Ton sport est partagé avec la famille' : 'Ton sport n\'est plus partagé');
  render();
}
// Forme › Réglages : la carte de partage s'ajoute aux réglages du module (point d'extension Forme.reglagesExtra).
(Forme.reglagesExtra = Forme.reglagesExtra || []).push(cartePartage);

function feuilleSeance(id) {
  const s = sport.seances.find((x) => x.id === id);
  if (!s) { toast('Séance introuvable'); return; }
  const m = memberById(s.member_id);
  const date = isoToDate(s.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fin = heureFin(s.heure, s.duree_min);
  const ligne = (t, v) => (v ? `<dt>${t}</dt><dd>${esc(v)}</dd>` : '');
  openSheet(`${sheetHead(titreSeance(s))}<div class="us-seance stack">
    <dl>${ligne('Qui', m?.nom)}${ligne('Quand', `${date}${s.heure ? `, ${s.heure.replace(':', ' h ')}${fin ? ` – ${fin.replace(':', ' h ')}` : ''}` : ''}`)}
      ${ligne('Type', TYPES_SEANCE[s.type])}${ligne('Durée', s.duree_min ? `${s.duree_min} min` : '')}${ligne('Distance', s.distance_m ? `${String(Math.round(s.distance_m / 100) / 10).replace('.', ',')} km` : '')}
      ${ligne('Dénivelé', s.dplus_m ? `${s.dplus_m} m` : '')}${ligne('État', { prevu: 'Prévue', fait: 'Faite', rate: 'Manquée' }[s.statut])}</dl>
    <p class="muted small">${s.user_id === me() ? 'Ta séance, telle que la famille la voit.' : `Séance partagée par ${esc(m?.nom || 'un membre du foyer')} : lecture seule.`}</p></div>`);
}

// ---------------------------------------------------------------------------
// (4) Sauvegarde : toutes les données du foyer en un fichier JSON, rappel mensuel
// ---------------------------------------------------------------------------
const SAUVEGARDE_TABLES = ['foyer_membres', 'foyer_comptes', 'reglages', 'recettes', 'planning_repas', 'courses_coches', 'courses_ajouts', 'historique_scans',
  'liens_produits', 'placards', 'restes', 'journal', 'aliments_favoris', 'produits_perso', 'activites', 'hydratation', 'compagnons', 'bilans', 'gains', 'pesees',
  'resume_jour', 'mensurations', 'forme_profil', 'forme_lieux', 'forme_exercices', 'forme_objectifs', 'forme_semaines', 'forme_seances',
  'mc_planning', 'mc_courses', 'mc_recettes', 'compte_preferences'];
// Jamais exportées : secrets (connexion Monsieur Cuisine, abonnements aux notifications) et tables techniques.
const SAUVEGARDE_EXCLUES = ['mc_secrets', 'push_abonnements', 'rappels_envoyes', 'config_app', 'mc_connexions', 'foyers'];
// Données personnelles : seulement celles du compte qui exporte (pas les séances partagées par les autres).
const SAUVEGARDE_PERSO = /^(forme_|mensurations$|compte_preferences$)/;
const tablesASauvegarder = (tablesConnues = []) => [...new Set([...SAUVEGARDE_TABLES, ...tablesConnues])].filter((t) => t && !SAUVEGARDE_EXCLUES.includes(t));
const nomFichierSauvegarde = (d) => `tribu-et-toutous-sauvegarde-${isoDate(d)}.json`;
const joursDepuis = (iso, maintenant) => (iso ? Math.floor((maintenant - new Date(iso)) / 864e5) : null);
// Rappel mensuel : jamais sauvegardé, ou il y a 30 jours ou plus.
function rappelSauvegarde(derniereIso, maintenant = new Date()) {
  const j = joursDepuis(derniereIso, maintenant);
  return { du: j === null || j >= 30, jours: j };
}
function construireSauvegarde({ tables, foyer: f, compte, maintenant = new Date(), absentes = [] }) {
  const lignes = Object.values(tables).reduce((t, l) => t + l.length, 0);
  return {
    app: APP_NAME, format: 'tribu-et-toutous/sauvegarde', version: 2, exported_at: maintenant.toISOString(),
    foyer: f, compte, resume: { tables: Object.keys(tables).length, lignes }, tables_absentes: absentes, tables,
    // Mêmes clés que l'ancien format : le fichier reste importable par « Importer ».
    settings: tables.reglages?.[0] || null, recipes: tables.recettes || [], meal_plan: tables.planning_repas || [], product_links: tables.liens_produits || [],
  };
}
async function lireTable(t) {
  const lignes = [];
  for (let i = 0; i < 50; i++) {
    let q = db.from(t).select('*').eq('foyer_id', foyer());
    if (SAUVEGARDE_PERSO.test(t)) q = q.eq('user_id', me());
    const { data, error } = await q.range(i * 1000, i * 1000 + 999);
    if (error) throw error;
    lignes.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return lignes;
}
const cleRappel = () => `sauvegarde:rappel:${me() || 'x'}`;
const derniereSauvegarde = () => Prefs.lire().sauvegarde_le || store.get(`sauvegarde:le:${me() || 'x'}`, null);
let exportEnCours = false;
async function exporterTout(bouton) {
  if (exportEnCours) return;
  if (!navigator.onLine) { toast('Connecte-toi à Internet pour télécharger la sauvegarde'); return; }
  exportEnCours = true;
  const texte = bouton?.innerHTML;
  if (bouton) { bouton.disabled = true; bouton.textContent = 'Préparation du fichier…'; }
  try {
    const tables = {};
    const absentes = [];
    for (const t of tablesASauvegarder(Object.values(T))) {
      try { tables[t] = await lireTable(t); } catch (e) {
        if (TABLE_ABSENTE(e) || e?.code === '42703') absentes.push(t);
        else throw e;
      }
    }
    const maintenant = new Date();
    const donnees = construireSauvegarde({ tables, foyer: { id: foyer(), nom: state.foyer?.nom || null }, compte: state.user?.email || null, maintenant, absentes });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' }));
    a.download = nomFichierSauvegarde(maintenant);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    store.set(`sauvegarde:le:${me()}`, maintenant.toISOString());
    await Prefs.enregistrer({ sauvegarde_le: maintenant.toISOString() }).catch((e) => console.warn('préférences', e));
    toast(`Sauvegarde téléchargée : ${donnees.resume.lignes} éléments`);
    if (state.tab === 'sauvegarde') render();
  } catch (e) { fail(e, 'Sauvegarde impossible'); } finally {
    exportEnCours = false;
    if (bouton?.isConnected) { bouton.disabled = false; bouton.innerHTML = texte; }
  }
}
function renduSauvegarde() {
  const der = derniereSauvegarde();
  const { du, jours } = rappelSauvegarde(der);
  const quand = der ? `Dernière sauvegarde le ${new Date(der).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}${jours ? ` (il y a ${jours} jour${jours > 1 ? 's' : ''})` : ''}` : 'Aucune sauvegarde pour l\'instant';
  return `<section class="card us-carte"><div class="us-etat"><span class="us-etat-ico">${ICON.download}</span><div class="grow"><b>Sauvegarde du foyer</b><br><span class="muted small" data-sauvegarde-quand>${esc(quand)}</span></div></div>
      <p>Un fichier avec toutes les données du foyer : membres, recettes, repas, courses, journal, activités, suivi, Monsieur Cuisine, et ton sport. Range-le en lieu sûr (Fichiers, iCloud Drive…).</p>
      ${du ? '<p class="small"><b>C\'est le moment de faire la sauvegarde du mois.</b></p>' : ''}
      <div class="us-actions"><button class="btn primary block" data-act="sauvegarde-exporter">${ICON.download} Télécharger la sauvegarde</button></div></section>
    <section class="card us-carte"><h3>Rappel mensuel</h3>
      <label class="us-interrupteur"><input type="checkbox" data-sauvegarde-rappel ${store.get(cleRappel(), true) ? 'checked' : ''}><span>Me le rappeler sur l'Accueil chaque mois</span></label></section>
    <section class="card us-carte"><h3>Restaurer</h3><p class="muted small">Réimporte les recettes, le planning et les réglages d'un fichier de sauvegarde.</p>
      <div class="us-actions"><label class="btn block">${ICON.upload} Importer un fichier<input type="file" accept="application/json" data-import-data hidden></label></div></section>`;
}

// ---------------------------------------------------------------------------
// Enregistrement des écrans
// ---------------------------------------------------------------------------
Modules.register({
  id: 'univers',
  onglet: 'plus',
  segment: 'Univers',
  ordre: 20,
  libelle: 'Univers graphique',
  icone: ICO_PALETTE,
  description: 'Couleurs, polices et motifs de ton affichage',
  tables: { compte_preferences: 'compte_preferences' },
  async charger(force, { horsLigne }) {
    await Prefs.charger({ horsLigne });
    const u = Prefs.lire().univers;
    if (universValide(u) && u !== universActuel()) { appliquerUnivers(u); render(); }
  },
  rendu: renduUnivers,
  actions: {
    'univers-choisir': async (b) => {
      const u = universDe(b.dataset.id);
      appliquerUnivers(u.id);
      render();
      toast(`Univers « ${u.nom} » choisi`);
      try { await Prefs.enregistrer({ univers: u.id }); } catch (e) { fail(e, 'Choix gardé sur cet appareil seulement'); }
    },
  },
  expose: { UNIVERS, universDe, universValide, policesUrl },
});

Modules.register({
  id: 'securite',
  onglet: 'plus',
  segment: 'Sécurité',
  ordre: 50,
  libelle: 'Sécurité',
  icone: ICO_VERROU,
  description: 'Face ID à l\'ouverture, code de secours',
  async charger() {
    // Verrou d'un autre compte (appareil prêté, changement de compte) : il ne s'applique pas.
    const cfg = configSecu();
    if (Verrou.ouvert() && cfg?.user && cfg.user !== me()) Verrou.cacher();
    bioDisponible();
  },
  rendu: renduSecurite,
  actions: {
    'securite-activer': () => feuilleCode('activer'),
    'securite-code': () => feuilleCode('changer'),
    'securite-desactiver': () => feuilleCode('desactiver'),
    'securite-verrouiller': () => Verrou.montrer('manuel'),
    'securite-bio': async () => {
      try { const cred = await creerCle(); store.set(SECU.config, { ...configSecu(), cred, bio: true }); render(); toast(`${nomBio()} ajouté`); } catch (e) { console.warn('clé d\'accès', e?.name || e); toast(`${nomBio()} n'a pas été configuré`); }
    },
  },
  expose: { codeRefuse, hacherCode, attenteApresEchecs, doitVerrouiller, uvVerifie, b64url, deB64url, nomBio, delaiTexte, octetsEnHex, hexEnOctets },
});

Modules.register({
  id: 'sauvegarde',
  onglet: 'plus',
  segment: 'Sauvegarde',
  ordre: 60,
  libelle: 'Sauvegarde',
  icone: ICON.download,
  description: 'Toutes les données du foyer dans un fichier',
  rendu: renduSauvegarde,
  actions: { 'sauvegarde-exporter': (b) => exporterTout(b) },
  // Rappel mensuel dans le fil de l'Accueil (personnel, pas dans le fil de la famille).
  sourcesAccueil: (ctx) => {
    if (ctx.famille || !me() || !store.get(cleRappel(), true)) return [];
    const { du, jours } = rappelSauvegarde(derniereSauvegarde(), ctx.date || new Date());
    return du ? [{ heure: null, titre: 'Sauvegarde du mois', detail: jours === null ? 'Garde une copie des données du foyer' : `Dernière il y a ${jours} jours`, icone: ICON.download, act: 'tab', data: { tab: 'sauvegarde' }, priorite: 0 }] : [];
  },
  notifications: [{ type: 'sauvegarde-mensuelle', libelle: 'Sauvegarde du mois', description: 'Un rappel par mois pour télécharger le fichier de sauvegarde', defaut: true }],
  expose: { tablesASauvegarder, nomFichierSauvegarde, rappelSauvegarde, construireSauvegarde, SAUVEGARDE_EXCLUES },
});

// Module du fichier (id = nom du fichier) : partage du sport, écran sans segment ouvert par switchTab('univers-securite').
Modules.register({
  id: 'univers-securite',
  onglet: 'forme',
  libelle: 'Partage du sport',
  async charger(force, { horsLigne }) { await chargerSport(horsLigne); },
  // Le réglage et les séances partagées à venir.
  rendu: () => {
    const auj = isoDate(new Date());
    const nomDe = (id) => memberById(id)?.nom || '';
    const prochaines = seancesVisibles(sport.seances, { moi: me(), partageMoi: partageMoi() }).filter((s) => s.date >= auj).slice(0, 12).map((s) => elementAgenda(s, nomDe));
    return `${cartePartage()}<section class="card f-pad" style="margin-top:14px"><h3>Séances partagées à venir</h3>
      ${prochaines.length ? `<div class="menu-list">${prochaines.map((e) => `<button data-act="partage-sport-voir" data-id="${esc(e.data.id)}">${ICO_COURSE}<span class="grow"><b>${esc(e.titre)}</b><br><span class="muted small">${esc(isoToDate(e.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }))}${e.heure ? ` · ${esc(e.heure)}` : ''}${e.detail ? ` · ${esc(e.detail)}` : ''}</span></span></button>`).join('')}</div>`
        : '<p class="muted small">Aucune séance partagée pour l\'instant.</p>'}</section>`;
  },
  agenda: agendaSport,
  // Fil de la famille : séances du jour partagées par les autres membres.
  sourcesAccueil: (ctx) => {
    if (!ctx.famille) return [];
    const nomDe = (id) => memberById(id)?.nom || '';
    return seancesVisibles(sport.seances, { moi: me(), partageMoi: false }).filter((s) => s.date === ctx.iso)
      .map((s) => ({ ...elementAgenda(s, nomDe), titre: `${nomDe(s.member_id) || 'Séance'} : ${titreSeance(s)}`, icone: ICO_COURSE, priorite: 1 }));
  },
  actions: { 'partage-sport-voir': (b) => feuilleSeance(b.dataset.id) },
  expose: { seancesVisibles, elementAgenda, heureFin, titreSeance },
});
