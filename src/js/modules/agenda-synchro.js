// Module « Agendas reliés » (Plus › Agendas reliés, aussi depuis les réglages de l'agenda) :
//  (a) export : un lien privé d'abonnement (.ics) de l'agenda familial, pour Calendrier (iPhone), Google Agenda ou Outlook.
//      Fonction Edge agenda-ics ; le jeton secret du foyer est dans agenda_export, régénérable (l'ancien lien cesse de marcher).
//  (b) import : des liens .ics (Google, Outlook, calendrier public iCloud) lus par la fonction agenda-synchro, montrés dans
//      l'agenda en lecture seule (pointillés + nom de l'agenda). Gardés sur l'appareil pour une lecture hors ligne.
//  (c) iCloud dans les deux sens (CalDAV) : identifiant Apple + mot de passe d'application, chiffrés côté serveur.
//      Les événements iCloud arrivent dans la table evenements (source 'icloud') ; ceux de l'appli partent vers iCloud.
// Tables (migration 2026-11-16_agenda-synchro.sql) : agenda_export, agenda_abonnements, agenda_caldav (lecture seule ici).
const cache = Modules.cache('agenda-synchro');
const URL_ICS = `${SUPABASE_URL}/functions/v1/agenda-ics`;
const FRAIS_MS = 60 * 60 * 1000; // un agenda importé est relu au plus toutes les heures
const CALDAV_MS = 15 * 60 * 1000; // synchro iCloud à l'ouverture si la dernière date de plus de 15 min

let exportLigne = null; // { id, jeton, nom, lu_le }
let abos = []; // agenda_abonnements
let caldav = null; // agenda_caldav (statut, compte masqué, calendrier, dernière synchro)
let absente = false; // migration pas encore appliquée
let importes = {}; // { aboId: { t, evenements } }
let occupe = ''; // action en cours (bouton désactivé)
const tableAbsente = (e) => /relation|does not exist|schema cache/i.test(e?.message || '');

// ---------------------------------------------------------------------------
// Fonctions pures (testées dans tests/unit/agenda-synchro.test.js)
// ---------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const minuitDe = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
// Lien collé (https ou webcal) → adresse https, ou null.
function normaliserUrl(s) {
  const t = String(s || '').trim().replace(/^webcals?:\/\//i, 'https://');
  if (!t) return null;
  try { const u = new URL(t); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : null; } catch { return null; }
}
const lienAbonnement = (jeton) => (jeton ? `${URL_ICS}?t=${encodeURIComponent(jeton)}` : '');
const lienWebcal = (jeton) => lienAbonnement(jeton).replace(/^https:/, 'webcal:');
// Jeton secret : 32 octets aléatoires en base64 « URL » (43 caractères).
function nouveauJeton() {
  const o = crypto.getRandomValues(new Uint8Array(32));
  let s = '';
  for (const b of o) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function serviceDe(url) {
  const h = (() => { try { return new URL(normaliserUrl(url)).hostname; } catch { return ''; } })();
  if (/(^|\.)google\.com$/.test(h)) return 'Google Agenda';
  if (/outlook|office365|live\.com|hotmail/.test(h)) return 'Outlook';
  if (/(^|\.)icloud\.com$/.test(h)) return 'iCloud';
  return 'Agenda';
}
// « à l'instant », « il y a 12 min », « il y a 3 h », « le 18/11 ».
function depuisQuand(iso, maintenant = new Date()) {
  if (!iso) return 'jamais';
  const d = new Date(iso);
  const min = Math.round((maintenant - d) / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 24 * 60) return `il y a ${Math.round(min / 60)} h`;
  return `le ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}
// Éléments d'agenda (format Agenda.sources) des agendas importés, pour [debut, fin].
// occ = occurrences(ev, a, b) du module agenda (récurrences, exceptions, journées entières).
function elementsImport(liste, donnees, debut, fin, occ) {
  if (typeof occ !== 'function') return [];
  const out = [];
  for (const abo of liste.filter((a) => a.actif !== false)) {
    for (const ev of donnees[abo.id]?.evenements || []) {
      for (const o of occ({ ...ev, id: `${abo.id}:${ev.cle}` }, debut, fin)) {
        // Un élément par jour couvert (comme l'agenda) ; l'heure seulement le premier jour.
        const dernier = minuitDe(ev.journee ? o.fin : new Date(Math.max(o.fin.getTime() - 1, o.debut.getTime())));
        for (let d = minuitDe(o.debut); d <= dernier && d <= fin; d = addDays(d, 1)) {
          if (d < minuitDe(debut)) continue;
          const premier = isoDate(d) === o.date;
          out.push({ id: `ics:${abo.id}:${o.cle}:${isoDate(d)}`, date: isoDate(d), heure: ev.journee || !premier ? null : hm(o.debut), heureFin: ev.journee ? null : hm(o.fin),
            titre: ev.titre, detail: [ev.lieu, abo.nom].filter(Boolean).join(' · '), membres: abo.member_id ? [abo.member_id] : [], couleur: null,
            act: 'agenda-synchro-voir', data: { abo: abo.id, cle: ev.cle, date: o.date } });
        }
      }
    }
  }
  return out;
}
const resumeAbo = (abo, maintenant = new Date()) => (abo.erreur ? abo.erreur
  : `${abo.nb != null ? `${abo.nb} événement${abo.nb > 1 ? 's' : ''}` : 'Pas encore lu'}${abo.maj_le ? ` · lu ${depuisQuand(abo.maj_le, maintenant)}` : ''}`);
const resumeCaldav = (c, maintenant = new Date()) => {
  if (!c) return 'Non relié';
  if (c.statut === 'choix') return 'Choisis le calendrier à synchroniser';
  if (c.statut === 'erreur') return `Erreur : ${c.erreur || 'synchro impossible'}`;
  const s = c.stats || {};
  return `${c.calendrier_nom || 'Calendrier'} · synchronisé ${depuisQuand(c.dernier_synchro, maintenant)}${s.recus || s.envoyes ? ` (${s.recus || 0} reçu${(s.recus || 0) > 1 ? 's' : ''}, ${s.envoyes || 0} envoyé${(s.envoyes || 0) > 1 ? 's' : ''})` : ''}`;
};

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------
const occurrencesAgenda = () => Modules.get('agenda')?.expose?.occurrences;
const majEcran = () => { Agenda.version = (Agenda.version || 0) + 1; if (state.tab === 'agenda-synchro' || state.tab === 'agenda') render(); };
const rechargerAgenda = () => Modules.get('agenda')?.charger?.(true, { horsLigne: false }).then(majEcran).catch(() => {});
const sauver = () => { cache.set('export', exportLigne); cache.set('abos', abos); cache.set('caldav', caldav); };

async function importer(abo) {
  try {
    const r = await Foyer.invoke('agenda-synchro', { action: 'importer', id: abo.id });
    importes = { ...importes, [abo.id]: { t: Date.now(), evenements: r.evenements || [] } };
    Object.assign(abo, { erreur: null, nb: (r.evenements || []).length, maj_le: new Date().toISOString(), nom: abo.nom || r.nom || serviceDe(abo.url) });
  } catch (e) {
    abo.erreur = e.message || 'Lecture impossible';
    importes = { ...importes, [abo.id]: { ...(importes[abo.id] || { evenements: [] }), t: Date.now() } };
  }
  cache.set('importes', importes);
  sauver();
}
async function rafraichirImports(force = false) {
  for (const abo of abos.filter((a) => a.actif !== false)) {
    if (!force && Date.now() - (importes[abo.id]?.t || 0) < FRAIS_MS) continue;
    await importer(abo);
  }
  majEcran();
}
async function synchroIcloud({ silencieux = false } = {}) {
  occupe = 'icloud'; majEcran();
  try {
    const r = await Foyer.invoke('agenda-synchro', { action: 'caldav-synchro' });
    caldav = { ...caldav, statut: 'ok', erreur: null, dernier_synchro: new Date().toISOString(), stats: r.stats };
    if (!silencieux) toast('Agenda synchronisé avec iCloud');
    rechargerAgenda();
  } catch (e) {
    caldav = { ...caldav, statut: 'erreur', erreur: e.message };
    if (!silencieux) fail(e, 'Synchro iCloud impossible');
  } finally { occupe = ''; sauver(); majEcran(); }
}

// ---------------------------------------------------------------------------
// Écran
// ---------------------------------------------------------------------------
const ICO = {
  lien: I('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  nuage: I('<path d="M7 18h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>'),
  fleches: I('<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  aide: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.8M12 17h.01"/>'),
};
const horsLigne = () => state.offline;
const dis = (cle) => (occupe === cle || horsLigne() ? 'disabled' : '');

function carteExport() {
  if (!exportLigne?.jeton) {
    return `<section class="card async-carte"><p class="muted small">Un lien secret que tu ajoutes une fois dans le Calendrier de ton iPhone, Google Agenda ou Outlook : l'agenda de la famille s'y affiche et se met à jour tout seul (toutes les heures environ).</p>
      <button class="btn primary block" data-act="agenda-synchro-creer-lien" ${dis('export')}>${ICO.lien} Créer le lien privé</button></section>`;
  }
  const lien = lienWebcal(exportLigne.jeton);
  return `<section class="card async-carte">
    <p class="muted small">Garde ce lien pour la famille : toute personne qui l'a peut voir l'agenda.</p>
    <div class="async-lien" data-async-lien>${esc(lien)}</div>
    <div class="async-boutons"><a class="btn small primary" href="${esc(lien)}">Ajouter à Calendrier</a><button class="btn small" data-act="agenda-synchro-copier">Copier le lien</button></div>
    <details class="async-aide"><summary>Google Agenda ou Outlook</summary>
      <ol><li><b>Google Agenda</b> (sur ordinateur) : Autres agendas › « + » › À partir de l'URL, colle le lien, puis « Ajouter l'agenda ».</li>
      <li><b>Outlook</b> : Ajouter un calendrier › S'abonner à partir du web, colle le lien, puis « Importer ».</li>
      <li>Google peut mettre jusqu'à 12 h à voir les changements ; l'iPhone, environ une heure.</li></ol></details>
    <p class="muted small">${exportLigne.lu_le ? `Dernière lecture par un agenda : ${esc(depuisQuand(exportLigne.lu_le))}.` : 'Aucun agenda ne l\'a encore lu.'}</p>
    <div class="async-boutons"><button class="btn small" data-act="agenda-synchro-regenerer" ${dis('export')}>Nouveau lien</button><button class="btn small" data-act="agenda-synchro-supprimer-lien" ${dis('export')}>Supprimer le lien</button></div>
  </section>`;
}

function carteImports() {
  const lignes = abos.map((a) => `<div class="async-abo ${a.actif === false ? 'off' : ''}">
      <div class="grow"><b>${esc(a.nom || serviceDe(a.url))}</b><span class="muted small ${a.erreur ? 'async-erreur' : ''}">${esc(resumeAbo(a))}${a.member_id && memberById(a.member_id) ? ` · ${esc(memberById(a.member_id).nom)}` : ''}</span></div>
      <input type="checkbox" role="switch" class="notif-switch" data-async-actif="${esc(a.id)}" ${a.actif !== false ? 'checked' : ''} aria-label="Afficher ${esc(a.nom || 'cet agenda')}">
      <div class="async-boutons async-abo-actions"><button class="btn small" data-act="agenda-synchro-actualiser" data-id="${esc(a.id)}" ${dis(`abo:${a.id}`)}>Relire</button><button class="btn small" data-act="agenda-synchro-retirer" data-id="${esc(a.id)}" ${dis(`abo:${a.id}`)}>Retirer</button></div>
    </div>`).join('');
  return `<section class="card async-carte">
    ${lignes || '<p class="muted small">Ajoute l\'agenda du travail, celui de la crèche ou d\'un club : ses événements s\'affichent dans l\'agenda de la famille, en lecture seule.</p>'}
    <button class="btn block" data-act="agenda-synchro-ajouter" ${dis('ajout')}>${ICO.plus} Ajouter un lien d'agenda</button>
  </section>`;
}

function carteIcloud() {
  if (!caldav || !caldav.calendrier_url && caldav.statut !== 'choix') {
    return `<section class="card async-carte"><p class="muted small">Les événements de ton calendrier iCloud arrivent dans l'agenda de la famille, et ceux de la famille partent dans iCloud. Il faut un mot de passe d'application Apple : ton vrai mot de passe n'est jamais demandé.</p>
      <div class="async-boutons"><button class="btn primary small" data-act="agenda-synchro-icloud" ${dis('icloud')}>${ICO.nuage} Relier iCloud</button><button class="btn small" data-act="agenda-synchro-aide">${ICO.aide} Comment faire ?</button></div></section>`;
  }
  return `<section class="card async-carte">
    <div class="async-abo"><div class="grow"><b>${esc(caldav.compte || 'Compte iCloud')}</b><span class="muted small ${caldav.statut === 'erreur' ? 'async-erreur' : ''}">${esc(resumeCaldav(caldav))}</span></div></div>
    <div class="async-boutons">${caldav.statut === 'choix' ? `<button class="btn primary small" data-act="agenda-synchro-icloud-changer" ${dis('icloud')}>Choisir le calendrier</button>`
      : `<button class="btn primary small" data-act="agenda-synchro-icloud-synchro" ${dis('icloud')}>${ICO.fleches} ${occupe === 'icloud' ? 'Synchro…' : 'Synchroniser maintenant'}</button><button class="btn small" data-act="agenda-synchro-icloud-changer" ${dis('icloud')}>Changer de calendrier</button>`}
      <button class="btn small" data-act="agenda-synchro-icloud-delier" ${dis('icloud')}>Délier</button></div>
    <p class="muted small">Synchro automatique toutes les heures, et à l'ouverture de l'appli.</p>
  </section>`;
}

function rendu() {
  if (absente) {
    return `<section class="card async-carte"><p><b>Bientôt disponible</b></p><p class="muted small">La mise à jour du serveur n'est pas encore faite (migration 2026-11-16_agenda-synchro.sql). L'agenda de la famille marche déjà ; les agendas reliés arriveront ensuite.</p></section>`;
  }
  return `<div class="async">
    ${horsLigne() ? '<p class="small async-alerte">Hors ligne : les agendas reliés reviennent avec le réseau. Les agendas déjà lus restent affichés.</p>' : ''}
    <h3 class="async-titre">L'agenda de la famille ailleurs</h3>${carteExport()}
    <h3 class="async-titre">D'autres agendas dans l'appli</h3>${carteImports()}
    <h3 class="async-titre">iCloud dans les deux sens</h3>${carteIcloud()}
  </div>`;
}

// ---------------------------------------------------------------------------
// Feuilles
// ---------------------------------------------------------------------------
const ETAPES_APPLE = [
  'Sur ton iPhone ou un ordinateur, ouvre <b>appleid.apple.com</b> et connecte-toi avec ton identifiant Apple.',
  'Va dans <b>Connexion et sécurité</b>, puis <b>Mots de passe pour app</b>.',
  'Touche <b>« + »</b> (ou « Générer un mot de passe »), et nomme-le <b>Tribu &amp; Toutous</b>.',
  'Apple affiche un mot de passe de 16 lettres, comme <b>abcd-efgh-ijkl-mnop</b> : copie-le.',
  'Reviens ici, touche <b>Relier iCloud</b>, puis colle ton identifiant Apple (ton adresse e-mail) et ce mot de passe.',
  'Choisis le calendrier à partager avec la famille (par exemple « Famille »). C\'est tout.',
];
function feuilleAide() {
  openSheet(`${sheetHead('Relier iCloud pas à pas')}
    <ol class="async-etapes">${ETAPES_APPLE.map((t) => `<li>${t}</li>`).join('')}</ol>
    <p class="muted small">Il faut avoir activé l'identification à deux facteurs sur ton compte Apple (c'est le cas sur tous les iPhone récents). Tu peux retirer l'accès à tout moment dans appleid.apple.com, en supprimant ce mot de passe.</p>
    <p class="muted small">Le mot de passe est chiffré sur le serveur de l'appli et ne revient jamais sur les téléphones.</p>
    <button class="btn primary block" data-act="agenda-synchro-icloud">${ICO.nuage} Relier iCloud</button>`);
}

function feuilleIcloud() {
  const el = openSheet(`${sheetHead('Relier iCloud')}
    <form class="stack" data-form="agenda-synchro-icloud" autocomplete="off">
      <label class="field"><span>Identifiant Apple</span><input class="input" name="identifiant" type="email" inputmode="email" autocomplete="username" placeholder="prenom@icloud.com" required></label>
      <label class="field"><span>Mot de passe d'application</span><input class="input" name="mdp" type="password" autocomplete="off" placeholder="xxxx-xxxx-xxxx-xxxx" required></label>
      <p class="muted small">Pas ton mot de passe Apple : un mot de passe d'application, créé sur appleid.apple.com. <button type="button" class="btn-link" data-act="agenda-synchro-aide">Comment faire ?</button></p>
      <p class="small async-erreur" data-async-msg hidden></p>
      <button class="btn primary block" type="submit">Vérifier et continuer</button>
    </form>`);
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = $('[data-async-msg]', el);
    const bouton = $('button[type="submit"]', f);
    bouton.disabled = true; bouton.textContent = 'Vérification auprès d\'iCloud…';
    try {
      const r = await Foyer.invoke('agenda-synchro', { action: 'caldav-relier', identifiant: f.identifiant.value.trim(), mot_de_passe: f.mdp.value.trim() });
      caldav = { ...(caldav || {}), statut: 'choix', compte: f.identifiant.value.trim().replace(/^(.{2}).*@/, '$1…@'), calendriers: r.calendriers };
      sauver();
      closeSheet();
      feuilleCalendriers(r.calendriers);
    } catch (err) {
      msg.hidden = false; msg.textContent = err.message || 'Connexion à iCloud impossible';
      bouton.disabled = false; bouton.textContent = 'Vérifier et continuer';
    }
  });
}

function feuilleCalendriers(liste = caldav?.calendriers || []) {
  if (!liste.length) { toast('Aucun calendrier sur ce compte iCloud : crée-en un dans l\'app Calendrier'); return; }
  const el = openSheet(`${sheetHead('Quel calendrier iCloud ?')}
    <p class="muted small">Ses événements s'ajoutent à l'agenda de la famille, et ceux de la famille y sont copiés.</p>
    ${caldav?.calendrier_url ? `<p class="muted small" data-changement>Changer de calendrier retire de l'agenda de la famille les événements reçus de « ${esc(caldav.calendrier_nom || 'l\'ancien calendrier')} », et retire de ce calendrier ceux que l'appli y avait copiés.</p>` : ''}
    <div class="stack">${liste.map((c) => `<button class="btn block async-cal" data-url="${esc(c.url)}"><span class="async-pastille" style="background:${/^#[0-9a-f]{6,8}$/i.test(c.couleur || '') ? c.couleur.slice(0, 7) : 'var(--primary)'}"></span>${esc(c.nom)}</button>`).join('')}</div>`);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-url]');
    if (!b) return;
    $$('[data-url]', el).forEach((x) => { x.disabled = true; });
    b.textContent = 'Première synchro…';
    try {
      const r = await Foyer.invoke('agenda-synchro', { action: 'caldav-choisir', url: b.dataset.url });
      const cal = liste.find((c) => c.url === b.dataset.url);
      caldav = { ...caldav, statut: 'ok', calendrier_url: cal.url, calendrier_nom: cal.nom, dernier_synchro: new Date().toISOString(), stats: r.stats, erreur: null };
      sauver();
      closeSheet();
      toast(`iCloud relié : ${r.stats?.recus || 0} événement${(r.stats?.recus || 0) > 1 ? 's' : ''} reçu${(r.stats?.recus || 0) > 1 ? 's' : ''}`);
      rechargerAgenda();
      majEcran();
    } catch (err) { closeSheet(); fail(err, 'Synchro iCloud impossible'); }
  });
}

function feuilleAjout() {
  const el = openSheet(`${sheetHead('Ajouter un lien d\'agenda')}
    <form class="stack" data-form="agenda-synchro-ajout">
      <label class="field"><span>Lien de l'agenda (.ics ou webcal://)</span><input class="input" name="url" type="url" inputmode="url" placeholder="https://calendar.google.com/…/basic.ics" required></label>
      <label class="field"><span>Nom (facultatif)</span><input class="input" name="nom" maxlength="60" placeholder="Travail d'Antoine, crèche…"></label>
      ${state.members.length ? `<label class="field"><span>Pour qui ?</span><select class="input" name="membre"><option value="">Toute la famille</option>${state.members.map((m) => `<option value="${esc(m.id)}">${esc(m.nom)}</option>`).join('')}</select></label>` : ''}
      <details class="async-aide"><summary>Où trouver ce lien ?</summary><ol>
        <li><b>Google Agenda</b> (ordinateur) : Paramètres › clique sur l'agenda › « Adresse secrète au format iCal ».</li>
        <li><b>Outlook</b> : Paramètres › Calendrier › Calendriers partagés › Publier un calendrier › lien ICS.</li>
        <li><b>iCloud</b> : app Calendrier › (i) à côté du calendrier › Calendrier public, puis « Partager le lien ».</li></ol></details>
      <p class="small async-erreur" data-async-msg hidden></p>
      <button class="btn primary block" type="submit">Ajouter</button>
    </form>`);
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = $('[data-async-msg]', el);
    const url = normaliserUrl(f.url.value);
    if (!url) { msg.hidden = false; msg.textContent = 'Ce lien ne ressemble pas à une adresse d\'agenda : il commence par https:// ou webcal://'; return; }
    const bouton = $('button[type="submit"]', f);
    bouton.disabled = true; bouton.textContent = 'Lecture de l\'agenda…';
    try {
      const essai = await Foyer.invoke('agenda-synchro', { action: 'importer', url });
      const abo = await Sync.upsert(T.agenda_abonnements, { nom: f.nom.value.trim() || essai.nom || serviceDe(url), url, member_id: f.membre?.value || null, actif: true });
      abos = [...abos.filter((a) => a.id !== abo.id), abo];
      sauver();
      closeSheet();
      await importer(abo);
      toast(`Agenda ajouté : ${abo.nb || 0} événement${(abo.nb || 0) > 1 ? 's' : ''}`);
      majEcran();
    } catch (err) {
      msg.hidden = false; msg.textContent = err.message || 'Lecture impossible';
      bouton.disabled = false; bouton.textContent = 'Ajouter';
    }
  });
}

function feuilleEvenement(b) {
  const abo = abos.find((a) => a.id === b.dataset.abo);
  const ev = importes[b.dataset.abo]?.evenements?.find((x) => x.cle === b.dataset.cle);
  if (!abo || !ev) return;
  const d = new Date(ev.debut);
  const jour = b.dataset.date ? isoToDate(b.dataset.date) : d;
  const quand = `${jour.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}${ev.journee ? '' : `, ${hm(d)} – ${hm(new Date(ev.fin || ev.debut))}`}`;
  openSheet(`${sheetHead(ev.titre)}
    <p><b>${esc(quand.charAt(0).toUpperCase() + quand.slice(1))}</b></p>
    ${ev.lieu ? `<p class="muted">${esc(ev.lieu)}</p>` : ''}${ev.notes ? `<p class="async-notes">${esc(ev.notes)}</p>` : ''}
    <p class="muted small">Agenda « ${esc(abo.nom || serviceDe(abo.url))} » (${esc(serviceDe(abo.url))}) : en lecture seule ici, à modifier dans l'agenda d'origine.</p>`);
}

// ---------------------------------------------------------------------------
// Enregistrement
// ---------------------------------------------------------------------------
document.addEventListener('change', async (e) => {
  const id = e.target?.dataset?.asyncActif;
  if (!id) return;
  const abo = abos.find((a) => a.id === id);
  if (!abo) return;
  try {
    Object.assign(abo, await Sync.upsert(T.agenda_abonnements, { ...abo, actif: e.target.checked }));
    sauver();
    if (abo.actif && !importes[abo.id]) await importer(abo);
    majEcran();
  } catch (err) { fail(err, 'Réglage non enregistré'); }
});

Modules.register({
  id: 'agenda-synchro',
  onglet: 'plus',
  segment: 'Agendas reliés',
  ordre: 35,
  libelle: 'Agendas reliés',
  icone: I('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4M9 15l2 2 4-4"/>'),
  description: 'iPhone, Google, Outlook et iCloud',
  tables: { agenda_export: 'agenda_export', agenda_abonnements: 'agenda_abonnements', agenda_caldav: 'agenda_caldav' },
  async charger(force, { horsLigne: hl } = {}) {
    importes = cache.get('importes', {});
    exportLigne = cache.get('export', null);
    abos = cache.get('abos', []);
    caldav = cache.get('caldav', null);
    if (hl || !foyer()) return;
    const [e, a, c] = await Promise.all([
      db.from(T.agenda_export).select('*').eq('foyer_id', foyer()).maybeSingle(),
      db.from(T.agenda_abonnements).select('*').eq('foyer_id', foyer()).order('created_at'),
      db.from(T.agenda_caldav).select('foyer_id, compte, calendrier_url, calendrier_nom, calendriers, statut, erreur, dernier_synchro, stats').eq('foyer_id', foyer()).maybeSingle(),
    ]);
    if ([e, a, c].some((r) => r.error && tableAbsente(r.error))) { absente = true; return; }
    for (const r of [e, a, c]) if (r.error) throw r.error;
    absente = false;
    exportLigne = e.data || null;
    abos = a.data || [];
    caldav = c.data || null;
    sauver();
    rafraichirImports(force).catch((err) => console.warn('agenda-synchro : import', err));
    if (caldav?.statut === 'ok' && Date.now() - +new Date(caldav.dernier_synchro || 0) > CALDAV_MS) synchroIcloud({ silencieux: true });
  },
  rendu,
  agenda: (debut, fin) => elementsImport(abos, importes, debut, fin, occurrencesAgenda()),
  actions: {
    'agenda-synchro-ouvrir': () => { closeSheet(); switchTab('agenda-synchro'); },
    'agenda-synchro-creer-lien': async () => {
      occupe = 'export'; render();
      try { exportLigne = await Sync.upsert(T.agenda_export, { id: exportLigne?.id, jeton: nouveauJeton(), nom: 'Tribu & Toutous' }); sauver(); toast('Lien privé créé'); }
      catch (e) { fail(e, 'Lien non créé'); } finally { occupe = ''; render(); }
    },
    'agenda-synchro-copier': async () => {
      try { await navigator.clipboard.writeText(lienWebcal(exportLigne?.jeton)); toast('Lien copié'); }
      catch { const z = $('[data-async-lien]'); if (z) { const r = document.createRange(); r.selectNodeContents(z); getSelection().removeAllRanges(); getSelection().addRange(r); } toast('Sélectionne le lien pour le copier'); }
    },
    'agenda-synchro-regenerer': async () => {
      if (!await confirmSheet('Créer un nouveau lien ? L\'ancien cessera de marcher : il faudra ajouter le nouveau dans chaque agenda.', 'Nouveau lien')) return;
      occupe = 'export'; render();
      try { exportLigne = await Sync.upsert(T.agenda_export, { ...exportLigne, jeton: nouveauJeton(), lu_le: null }); sauver(); toast('Nouveau lien créé'); }
      catch (e) { fail(e, 'Lien non changé'); } finally { occupe = ''; render(); }
    },
    'agenda-synchro-supprimer-lien': async () => {
      if (!await confirmSheet('Supprimer le lien ? Les agendas abonnés ne verront plus celui de la famille.', 'Supprimer')) return;
      try { await Sync.supprimer(T.agenda_export, exportLigne.id); exportLigne = null; sauver(); toast('Lien supprimé'); render(); } catch (e) { fail(e); }
    },
    'agenda-synchro-ajouter': () => feuilleAjout(),
    'agenda-synchro-actualiser': async (b) => {
      const abo = abos.find((a) => a.id === b.dataset.id);
      if (!abo) return;
      occupe = `abo:${abo.id}`; render();
      await importer(abo);
      occupe = ''; render();
      toast(abo.erreur ? 'Lecture impossible' : 'Agenda relu');
    },
    'agenda-synchro-retirer': async (b) => {
      const abo = abos.find((a) => a.id === b.dataset.id);
      if (!abo || !await confirmSheet(`Retirer « ${abo.nom || 'cet agenda'} » ? Ses événements disparaissent de l'agenda de la famille.`, 'Retirer')) return;
      try {
        await Sync.supprimer(T.agenda_abonnements, abo.id);
        abos = abos.filter((a) => a.id !== abo.id);
        const { [abo.id]: _x, ...reste } = importes;
        importes = reste;
        cache.set('importes', importes); sauver(); render();
      } catch (e) { fail(e); }
    },
    'agenda-synchro-voir': (b) => feuilleEvenement(b),
    'agenda-synchro-aide': () => feuilleAide(),
    'agenda-synchro-icloud': () => { if (horsLigne()) return toast('Il faut le réseau pour relier iCloud'); closeSheet(); feuilleIcloud(); },
    'agenda-synchro-icloud-synchro': () => synchroIcloud(),
    'agenda-synchro-icloud-changer': () => feuilleCalendriers(),
    'agenda-synchro-icloud-delier': async () => {
      if (!await confirmSheet('Délier iCloud ? Les événements déjà reçus restent dans l\'agenda, mais ne seront plus mis à jour.', 'Délier')) return;
      try { await Foyer.invoke('agenda-synchro', { action: 'caldav-deconnecter' }); caldav = null; sauver(); toast('iCloud délié'); render(); } catch (e) { fail(e); }
    },
  },
  expose: { normaliserUrl, lienAbonnement, lienWebcal, nouveauJeton, serviceDe, depuisQuand, elementsImport, resumeAbo, resumeCaldav },
});
