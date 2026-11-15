// ---------------------------------------------------------------------------
// Module « Photos » : l'album privé du foyer (photos réduites dans le téléphone, ~1600 px / ~300 Ko,
// et miniatures), les albums, les liens vers des albums Google Photos ou iCloud partagés, et la gazette
// mensuelle des grands-parents (page imprimable, ou enregistrée en PDF depuis le menu d'impression).
// Les outils communs (Stockage, images, comptes) viennent du module « Messages » (chargé avant celui-ci).
// Migration : supabase/migrations/2026-11-16_messages-photos.sql.
// ---------------------------------------------------------------------------

const S = Modules.get('messages')?.service;
if (!S) throw new Error('module photos : le module messages (outils communs) doit être chargé avant');
const { Stockage, preparerImage, hydrater, imgTag, nomCompte, monNom, notifier, enFile, idsEnFile, fusionner, cheminFichier, dateLongue, listeNoms, jourDe, deuxChiffres, MOIS_NOMS, icPhoto } = S;
const cachePh = Modules.cache('photos');

// ===== 1. Outils purs (exposés aux tests unitaires) =====================================
const GAZETTE_MAX = 9;
const MAX_FICHIERS = 20;
// Lien d'album partagé : 'google', 'icloud', 'autre' (adresse https valable), ou null.
function fournisseurLien(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase();
  if (h === 'photos.app.goo.gl' || h === 'photos.google.com' || h === 'goo.gl') return 'google';
  if (h === 'www.icloud.com' || h === 'icloud.com' || h === 'share.icloud.com' || h.endsWith('.icloud.com')) return 'icloud';
  return 'autre';
}
const FOURNISSEURS = { google: 'Google Photos', icloud: 'iCloud', autre: 'Album partagé' };
// Mois 'AAAA-MM'.
const moisDe = (d) => `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}`;
function moisDecale(mois, n) {
  const [a, m] = mois.split('-').map(Number);
  return moisDe(new Date(a, m - 1 + n, 1));
}
function moisLibelle(mois) {
  const [a, m] = mois.split('-').map(Number);
  return `${MOIS_NOMS[m - 1]} ${a}`;
}
// « de novembre », « d'octobre », « d'août » : élision devant une voyelle.
const deMois = (mois) => { const n = MOIS_NOMS[Number(mois.split('-')[1]) - 1]; return /^[aeiouyàâéèêëîïôöùûü]/i.test(n) ? `d'${n}` : `de ${n}`; };
const photosDuMois = (photos, mois) => photos.filter((p) => String(p.prise_le || p.created_at || '').slice(0, 7) === mois)
  .sort((a, b) => String(a.prise_le || a.created_at).localeCompare(String(b.prise_le || b.created_at)));
// Choix par défaut pour la gazette : jusqu'à n photos réparties sur le mois, celles qui ont une légende d'abord.
function choixGazette(photos, mois, n = 6) {
  const du = photosDuMois(photos, mois);
  if (du.length <= n) return du.map((p) => p.id);
  const avec = du.filter((p) => p.legende);
  const pris = new Set(avec.length <= n ? avec.map((p) => p.id) : []);
  for (let i = 0; pris.size < n && i < n * 4; i++) pris.add(du[Math.floor((i * du.length) / n) % du.length].id);
  for (const p of du) { if (pris.size >= n) break; pris.add(p.id); }
  return du.filter((p) => pris.has(p.id)).slice(0, n).map((p) => p.id);
}
// Âge en toutes lettres : « 6 mois », « 1 an et 7 mois », « 35 ans ».
function ageTexte(naissance, date = new Date()) {
  if (!naissance) return '';
  const n = isoToDate(String(naissance).slice(0, 10));
  let mois = (date.getFullYear() - n.getFullYear()) * 12 + date.getMonth() - n.getMonth();
  if (date.getDate() < n.getDate()) mois--;
  if (mois < 0) return '';
  if (mois < 1) return 'moins d\'un mois';
  if (mois < 12) return `${mois} mois`;
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  return `${ans} an${ans > 1 ? 's' : ''}${ans < 3 && reste ? ` et ${reste} mois` : ''}`;
}
// Petites nouvelles proposées (sans IA) : l'âge des enfants, le nombre de photos et de messages du mois.
function nouvellesSuggerees({ membres = [], photos = [], messages = [], mois }) {
  const [a, m] = mois.split('-').map(Number);
  const fin = new Date(a, m, 0);
  const out = [];
  for (const mb of membres) {
    if (!mb.naissance) continue;
    const ans = (fin - isoToDate(String(mb.naissance).slice(0, 10))) / (365.25 * 864e5);
    if (ans >= 0 && ans < 12) out.push(`${mb.nom} a ${ageTexte(mb.naissance, fin)}.`);
  }
  const np = photosDuMois(photos, mois).length;
  const nm = messages.filter((x) => String(x.created_at || '').slice(0, 7) === mois).length;
  if (np) out.push(`${np} photo${np > 1 ? 's' : ''} ajoutée${np > 1 ? 's' : ''} à l'album ce mois-ci.`);
  if (nm) out.push(`${nm} message${nm > 1 ? 's' : ''} échangé${nm > 1 ? 's' : ''} dans la discussion de la famille.`);
  return out;
}
// Numéro de la gazette : 1 pour le premier mois enregistré, puis +1 par mois.
function numeroGazette(mois, moisEnregistres = []) {
  const premier = [...moisEnregistres, mois].sort()[0];
  const [a1, m1] = premier.split('-').map(Number);
  const [a2, m2] = mois.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}
// Lignes de nouvelles : une par ligne, puces et espaces retirés.
const lignesNouvelles = (texte) => String(texte || '').split('\n').map((l) => l.replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean);
// Page de la gazette (HTML pur) : à l'écran en aperçu, et en A4 à l'impression.
function gazetteHtml(g, { photos = [], urls = {}, numero = 1, foyerNom = '', signature = '', famille = '' } = {}) {
  const choisies = (g.photos || []).map((id) => photos.find((p) => p.id === id)).filter(Boolean);
  const nouvelles = lignesNouvelles(g.nouvelles);
  const figure = (p) => `<figure class="mp-gz-fig">${urls[p.chemin] ? `<img src="${esc(urls[p.chemin])}" alt="${esc(p.legende || 'Photo de la famille')}">` : '<div class="mp-gz-vide"></div>'}
    <figcaption>${p.legende ? `<b>${esc(p.legende)}</b>` : ''}${p.prise_le ? `<span>${esc(dateLongue(p.prise_le))}</span>` : ''}</figcaption></figure>`;
  return `<article class="mp-gz">
    <header class="mp-gz-tete"><div class="mp-gz-sur"><span>Le journal de la famille</span><span>N° ${numero}</span></div>
      <h1>${esc(g.titre || 'La Gazette de la Tribu')}</h1>
      <div class="mp-gz-date">${esc(moisLibelle(g.mois))}${foyerNom ? ` · ${esc(foyerNom)}` : ''}</div></header>
    ${g.mot ? `<section class="mp-gz-mot"><h2>Le mot du mois</h2>${String(g.mot).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}${signature ? `<p class="mp-gz-sign">${esc(signature)}</p>` : ''}</section>` : ''}
    ${choisies.length ? `<section class="mp-gz-photos" data-n="${Math.min(choisies.length, 9)}">${choisies.map(figure).join('')}</section>` : ''}
    ${nouvelles.length ? `<section class="mp-gz-nouvelles"><h2>Les petites nouvelles</h2><ul>${nouvelles.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
    <footer class="mp-gz-pied">Avec tous nos bisous${famille ? ` · ${esc(famille)}` : ''}</footer>
  </article>`;
}

const icJournal = I('<path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M8 8h8M8 12h8M8 16h5"/>');
const icImprimer = I('<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>');
// ===== 6. Photos et albums ==============================================================
const P = { photos: [], albums: [], gazettes: [], vue: 'photos', album: null, mois: null, brouillons: {} };
function sauverPhotos() { cachePh.set('etat', { photos: P.photos, albums: P.albums, gazettes: P.gazettes }); }
// Seuls les brouillons modifiés sont gardés : un mois jamais touché repart des propositions du moment.
const sauverBrouillons = () => cachePh.set('brouillons', Object.fromEntries(Object.entries(P.brouillons).filter(([, b]) => !b.neuf)));
const photosTriees = (liste) => [...liste].sort((a, b) => String(b.prise_le || '').localeCompare(String(a.prise_le || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
const albumById = (id) => P.albums.find((a) => a.id === id) || null;

async function chargerPhotos(horsLigne) {
  P.brouillons = cachePh.get('brouillons', {});
  if (horsLigne) { const c = cachePh.get('etat', null); if (c) Object.assign(P, c); return; }
  const [ph, al, gz] = await Promise.all([
    db.from(T.mp_photos).select('*').eq('foyer_id', foyer()).order('prise_le', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
    db.from(T.mp_albums).select('*').eq('foyer_id', foyer()).order('created_at'),
    db.from(T.mp_gazettes).select('*').eq('foyer_id', foyer()).order('mois'),
  ]);
  for (const r of [ph, al, gz]) if (r.error) throw r.error;
  const attente = P.photos.filter((p) => enFile(T.mp_photos, p.id) && !ph.data.some((x) => x.id === p.id));
  P.photos = [...(ph.data || []), ...attente];
  P.albums = al.data || [];
  P.gazettes = gz.data || [];
  sauverPhotos();
  const a = cachePh.get('a-notifier', []);
  const arrivees = a.filter((id) => P.photos.some((p) => p.id === id && !enFile(T.mp_photos, id)));
  if (arrivees.length) { notifier({ type: 'photo', ids: arrivees }); cachePh.set('a-notifier', a.filter((id) => !arrivees.includes(id))); }
}

function vignettes(liste, { choix = null } = {}) {
  const attente = idsEnFile(T.mp_photos);
  return `<div class="mp-grille">${liste.map((p) => {
    const pris = choix ? choix.includes(p.id) : false;
    return `<button class="mp-vignette ${pris ? 'mp-pris' : ''}" data-act="${choix ? 'photos-gazette-choisir' : 'photos-voir'}" data-id="${p.id}" ${choix ? `aria-pressed="${pris}"` : ''} aria-label="${esc(p.legende || `Photo du ${dateLongue(p.prise_le)}`)}">
      ${imgTag(p.miniature || p.chemin, p.legende || '')}${choix ? `<span class="mp-coche" aria-hidden="true">${pris ? ICON.check : ''}</span>` : ''}${attente.has(p.id) ? '<span class="mp-attente">En attente</span>' : ''}</button>`;
  }).join('')}</div>`;
}

function vuePhotos() {
  const al = P.album ? albumById(P.album) : null;
  const liste = photosTriees(al ? P.photos.filter((p) => p.album_id === al.id) : P.photos);
  // Regroupement par mois, du plus récent au plus ancien.
  const mois = [];
  for (const p of liste) {
    const k = String(p.prise_le || p.created_at || '').slice(0, 7) || 'sans date';
    let g = mois[mois.length - 1];
    if (!g || g.k !== k) { g = { k, photos: [] }; mois.push(g); }
    g.photos.push(p);
  }
  const ajout = `<label class="btn primary mp-ajouter">${ICON.plus} Ajouter des photos<input type="file" accept="image/*" multiple data-mp-fichiers hidden></label>`;
  return `${al ? `<div class="mp-filtre card"><span class="grow"><span class="muted small">Album</span><br><b>${esc(al.titre)}</b> · ${liste.length} photo${liste.length > 1 ? 's' : ''}</span>
      <button class="btn small" data-act="photos-album-menu" data-id="${al.id}" aria-label="Options de l'album">${ICON.dots}</button><button class="btn small" data-act="photos-album" data-id="" aria-label="Toutes les photos">${ICON.close}</button></div>` : ''}
    <div class="mp-barre">${ajout}</div>
    ${liste.length ? mois.map((g) => `<h3 class="mp-mois">${esc(g.k === 'sans date' ? 'Sans date' : moisLibelle(g.k))} <span class="muted small">${g.photos.length}</span></h3>${vignettes(g.photos)}`).join('')
    : `<div class="empty">${icPhoto}<p><b>${al ? 'Cet album est vide' : 'L\'album de la famille'}</b></p><p class="small">Les photos sont réduites dans ton téléphone (environ 300 Ko chacune) et restent privées : seul le foyer les voit.</p></div>`}`;
}

function vueAlbums() {
  const internes = P.albums.filter((a) => !a.lien);
  const liens = P.albums.filter((a) => a.lien);
  const carte = (a) => {
    const ph = photosTriees(P.photos.filter((p) => p.album_id === a.id));
    const couv = P.photos.find((p) => p.id === a.couverture) || ph[0];
    return `<button class="mp-album card" data-act="photos-album" data-id="${a.id}">
      <span class="mp-couv">${couv ? imgTag(couv.miniature || couv.chemin, '') : icPhoto}</span>
      <span class="mp-album-txt"><b>${esc(a.titre)}</b><span class="muted small">${ph.length} photo${ph.length > 1 ? 's' : ''}</span></span></button>`;
  };
  const lien = (a) => {
    const f = fournisseurLien(a.lien) || 'autre';
    return `<div class="mp-lien card"><span class="mp-lien-ico mp-${f}">${ICON.link}</span>
      <span class="grow"><b>${esc(a.titre)}</b><br><span class="muted small">${esc(FOURNISSEURS[f])}${a.description ? ` · ${esc(a.description)}` : ''}</span></span>
      <a class="btn small" href="${esc(safeUrl(a.lien))}" target="_blank" rel="noopener noreferrer">${ICON.ext} Ouvrir</a>
      <button class="icon-btn" data-act="photos-album-menu" data-id="${a.id}" aria-label="Options de ${esc(a.titre)}">${ICON.dots}</button></div>`;
  };
  return `<div class="mp-barre"><button class="btn primary" data-act="photos-album-nouveau">${ICON.plus} Nouvel album</button><button class="btn" data-act="photos-album-nouveau" data-lien="1">${ICON.link} Lien partagé</button></div>
    ${internes.length ? `<div class="mp-albums">${internes.map(carte).join('')}</div>` : '<p class="muted small">Aucun album pour l\'instant : « Vacances à Annecy », « Les toutous », « Premiers pas »…</p>'}
    <h3 class="mp-mois">Albums partagés ailleurs</h3>
    ${liens.length ? `<div class="stack">${liens.map(lien).join('')}</div>` : '<p class="muted small">Ajoute le lien d\'un album Google Photos ou d\'un album partagé iCloud : les photos restent chez eux, gratuitement, et s\'ouvrent d\'un geste depuis ici.</p>'}`;
}

function rendrePhotos() {
  if (!P.mois) P.mois = moisDecale(moisDe(new Date()), new Date().getDate() <= 10 ? -1 : 0);
  queueMicrotask(() => hydrater($('#main')));
  const chips = [['photos', 'Photos'], ['albums', 'Albums'], ['gazette', 'Gazette']]
    .map(([v, l]) => `<button class="chip" data-act="photos-vue" data-v="${v}" aria-pressed="${P.vue === v}">${esc(l)}</button>`).join('');
  const corps = P.vue === 'albums' ? vueAlbums() : P.vue === 'gazette' ? vueGazette() : vuePhotos();
  return `<div class="chips mp-chips" role="group" aria-label="Affichage de l'album">${chips}</div>${corps}`;
}

const optionsAlbums = (choisi) => `<option value="">— Aucun album —</option>${P.albums.filter((a) => !a.lien).map((a) => `<option value="${a.id}" ${a.id === choisi ? 'selected' : ''}>${esc(a.titre)}</option>`).join('')}`;
const casesMembres = (choisis = []) => (state.members || []).map((m) => `<label class="chip mp-qui"><input type="checkbox" name="membres" value="${m.id}" ${choisis.includes(m.id) ? 'checked' : ''}> ${esc(m.nom)}</label>`).join('');

// Ajout de photos : réglages communs (album, légende, date, qui), puis envoi une par une.
function ajouterPhotos(fichiers) {
  const liste = [...fichiers].filter((f) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)).slice(0, MAX_FICHIERS);
  if (!liste.length) { toast('Aucune image dans la sélection'); return; }
  if (fichiers.length > MAX_FICHIERS) toast(`${MAX_FICHIERS} photos au plus à la fois`);
  const dates = liste.map((f) => isoDate(new Date(f.lastModified || Date.now())));
  const uneDate = dates.every((d) => d === dates[0]);
  const urls = liste.map((f) => URL.createObjectURL(f));
  const el = openSheet(`${sheetHead(`Ajouter ${liste.length} photo${liste.length > 1 ? 's' : ''}`)}
    <form class="stack" data-x="form">
      <div class="mp-apercus">${urls.map((u) => `<img src="${u}" alt="">`).join('')}</div>
      <label class="field"><span>Légende${liste.length > 1 ? ' (pour toutes)' : ''}</span><input class="input" name="legende" maxlength="200" placeholder="Premier bain de mer de Zoé"></label>
      <div class="grid2"><label class="field"><span>Album</span><select class="input" name="album">${optionsAlbums(P.album)}</select></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${uneDate ? dates[0] : ''}"><span class="muted small mp-aide">${uneDate ? '' : 'Vide : date de chaque fichier'}</span></label></div>
      <fieldset class="mp-qui-liste"><legend class="muted small">Sur la photo</legend><div class="row wrap">${casesMembres()}</div></fieldset>
      <button class="btn primary block" data-x="ok">${ICON.upload} Ajouter à l'album</button>
      <p class="muted small" data-x="etat" aria-live="polite"></p>
    </form>`, { onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)) });
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = $('[data-x="ok"]', f);
    btn.disabled = true;
    const reglages = { legende: f.legende.value.trim() || null, album_id: f.album.value || null, date: f.date.value || null, membres: $$('[name="membres"]:checked', f).map((c) => c.value) };
    let ok = 0;
    let attente = 0;
    const ids = [];
    for (let i = 0; i < liste.length; i++) {
      $('[data-x="etat"]', f).textContent = `Préparation et envoi : ${i + 1} sur ${liste.length}…`;
      try {
        const r = await envoyerPhoto(liste[i], { ...reglages, date: reglages.date || dates[i] });
        ids.push(r.id);
        ok++;
        if (r.attente) attente++;
      } catch (err) { console.error(err); }
    }
    closeSheet();
    if (ids.length) {
      if (attente) cachePh.set('a-notifier', [...cachePh.get('a-notifier', []), ...ids]);
      else notifier({ type: 'photo', ids });
    }
    toast(ok === liste.length ? `${ok} photo${ok > 1 ? 's' : ''} ajoutée${ok > 1 ? 's' : ''}${attente ? ' (envoi au retour du réseau)' : ''}` : `${ok} sur ${liste.length} photos ajoutées`);
    P.vue = 'photos';
    if (state.tab === 'photos') render();
  });
}

async function envoyerPhoto(fichier, { legende, album_id, date, membres }) {
  const id = uid();
  const img = await preparerImage(fichier);
  const chemin = cheminFichier(foyer(), 'album', id);
  const miniature = cheminFichier(foyer(), 'album', id, true);
  const a = await Stockage.deposer(chemin, img.grande);
  await Stockage.deposer(miniature, img.mini, { garder: true });
  const ligne = { id, album_id, chemin, miniature, largeur: img.l, hauteur: img.h, poids: img.grande.size, legende, prise_le: date, membres, auteur: monNom() };
  const r = await Sync.upsert(T.mp_photos, ligne);
  fusionner(P.photos, { ...r, user_id: r.user_id || me() });
  sauverPhotos();
  return { id, attente: a.attente || enFile(T.mp_photos, id) };
}

// Visionneuse : grande photo, légende, date, qui ; précédente / suivante dans la liste affichée.
function voirPhoto(id) {
  const liste = photosTriees(P.album ? P.photos.filter((p) => p.album_id === P.album) : P.photos);
  let i = liste.findIndex((p) => p.id === id);
  if (i < 0) return;
  const el = openSheet('<div data-x="corps"></div>', { full: true });
  const dessiner = () => {
    const p = liste[i];
    const al = albumById(p.album_id);
    const qui = (p.membres || []).map((mid) => memberById(mid)?.nom).filter(Boolean);
    const g = P.gazettes.find((x) => x.mois === String(p.prise_le || '').slice(0, 7));
    const brou = brouillon(String(p.prise_le || '').slice(0, 7));
    const dansGazette = (brou.photos || g?.photos || []).includes(p.id);
    $('[data-x="corps"]', el).innerHTML = `${sheetHead(p.legende || dateLongue(p.prise_le) || 'Photo')}
      <div class="mp-visu" style="aspect-ratio:${Number(p.largeur) || 4}/${Number(p.hauteur) || 3}">${imgTag(p.chemin, p.legende || 'Photo de la famille', { garder: false })}</div>
      <div class="row mp-nav"><button class="btn small" data-x="prec" ${i ? '' : 'disabled'} aria-label="Photo précédente">${ICON.back}</button>
        <span class="grow muted small" style="text-align:center">${i + 1} / ${liste.length}</span>
        <button class="btn small" data-x="suiv" ${i < liste.length - 1 ? '' : 'disabled'} aria-label="Photo suivante">${ICON.next}</button></div>
      <p class="mp-meta">${p.prise_le ? `<b>${esc(dateLongue(p.prise_le))}</b>` : ''}${qui.length ? ` · ${esc(listeNoms(qui))}` : ''}<br>
        <span class="muted small">Ajoutée par ${esc(p.user_id === me() ? 'toi' : nomCompte(p.user_id, p.auteur))}${al ? ` · album « ${esc(al.titre)} »` : ''}</span></p>
      <div class="grid2"><button class="btn" data-x="modif">${ICON.edit} Modifier</button>
        <button class="btn ${dansGazette ? 'soft' : ''}" data-x="gazette" aria-pressed="${dansGazette}">${icJournal} ${dansGazette ? 'Dans la gazette' : 'Pour la gazette'}</button></div>
      <button class="btn block danger" data-x="suppr" style="margin-top:8px">${ICON.trash} Supprimer la photo</button>`;
    hydrater(el);
  };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const p = liste[i];
    if (b.dataset.x === 'prec' && i > 0) { i--; dessiner(); }
    if (b.dataset.x === 'suiv' && i < liste.length - 1) { i++; dessiner(); }
    if (b.dataset.x === 'modif') modifierPhoto(p, dessiner);
    if (b.dataset.x === 'gazette') { basculerGazette(String(p.prise_le || jourDe(p.created_at)).slice(0, 7), p.id); dessiner(); }
    if (b.dataset.x === 'suppr') {
      if (!(await confirmSheet('Supprimer cette photo de l\'album ?', 'Supprimer'))) return;
      try {
        await Sync.supprimer(T.mp_photos, p.id);
        P.photos = P.photos.filter((x) => x.id !== p.id);
        sauverPhotos();
        // Le fichier n'est effacé que s'il ne sert plus (une photo de la discussion peut aussi être dans l'album).
        if (!S.messages().some((m) => m.photo?.chemin === p.chemin)) Stockage.supprimer([p.chemin, p.miniature]).catch((err) => console.warn(err));
        closeSheet();
        render();
        toast('Photo supprimée');
      } catch (err) { fail(err); }
    }
  });
  dessiner();
}

function modifierPhoto(p, apres) {
  const el = openSheet(`${sheetHead('Modifier la photo')}
    <form class="stack">
      <label class="field"><span>Légende</span><input class="input" name="legende" maxlength="200" value="${esc(p.legende || '')}"></label>
      <div class="grid2"><label class="field"><span>Album</span><select class="input" name="album">${optionsAlbums(p.album_id)}</select></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${esc(p.prise_le || '')}"></label></div>
      <fieldset class="mp-qui-liste"><legend class="muted small">Sur la photo</legend><div class="row wrap">${casesMembres(p.membres || [])}</div></fieldset>
      <button class="btn primary block">Enregistrer</button></form>`);
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const maj = { ...p, legende: f.legende.value.trim() || null, album_id: f.album.value || null, prise_le: f.date.value || p.prise_le, membres: $$('[name="membres"]:checked', f).map((c) => c.value) };
    try {
      fusionner(P.photos, await Sync.upsert(T.mp_photos, maj));
      sauverPhotos();
      closeSheet();
      Object.assign(p, maj);
      apres?.();
      render();
      toast('Photo modifiée');
    } catch (err) { fail(err); }
  });
}

// Album de l'appli, ou lien vers un album partagé (Google Photos, iCloud).
function editerAlbum(a = null, lien = false) {
  const estLien = a ? !!a.lien : lien;
  const el = openSheet(`${sheetHead(a ? 'Modifier l\'album' : estLien ? 'Lien vers un album partagé' : 'Nouvel album')}
    <form class="stack">
      <label class="field"><span>Nom</span><input class="input" name="titre" required maxlength="80" value="${esc(a?.titre || '')}" placeholder="${estLien ? 'Photos de l\'été (Manon)' : 'Vacances à Annecy'}"></label>
      ${estLien ? `<label class="field"><span>Adresse du lien partagé</span><input class="input" name="lien" type="url" inputmode="url" required value="${esc(a?.lien || '')}" placeholder="https://photos.app.goo.gl/…"></label>
        <label class="field"><span>Précision (facultatif)</span><input class="input" name="description" maxlength="120" value="${esc(a?.description || '')}" placeholder="Album tenu par Antoine"></label>
        <p class="muted small">Dans Google Photos : Partager › Créer un lien. Dans Photos sur iPhone : album partagé › Personnes › Site web public.</p>` : ''}
      <button class="btn primary block">${a ? 'Enregistrer' : 'Créer'}</button></form>`);
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const ligne = { ...(a || {}), titre: f.titre.value.trim() };
    if (estLien) {
      const u = f.lien.value.trim();
      if (!fournisseurLien(u)) { toast('Adresse invalide : elle doit commencer par https://'); return; }
      ligne.lien = u;
      ligne.description = f.description.value.trim() || null;
    }
    if (!ligne.titre) return;
    try {
      fusionner(P.albums, await Sync.upsert(T.mp_albums, ligne));
      sauverPhotos();
      closeSheet();
      P.vue = 'albums';
      render();
      toast(a ? 'Album modifié' : estLien ? 'Lien ajouté' : 'Album créé');
    } catch (err) { fail(err); }
  });
}

function menuAlbum(id) {
  const a = albumById(id);
  if (!a) return;
  const el = openSheet(`${sheetHead(a.titre)}<div class="menu-list">
    <button class="btn block" data-x="modif">${ICON.edit} ${a.lien ? 'Modifier le lien' : 'Renommer'}</button>
    <button class="btn block danger" data-x="suppr">${ICON.trash} Supprimer ${a.lien ? 'le lien' : 'l\'album (les photos restent)'}</button></div>`);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    closeSheet();
    if (b.dataset.x === 'modif') editerAlbum(a);
    if (b.dataset.x === 'suppr') {
      if (!(await confirmSheet(`Supprimer « ${a.titre} » ?`, 'Supprimer'))) return;
      try {
        await Sync.supprimer(T.mp_albums, a.id);
        P.albums = P.albums.filter((x) => x.id !== a.id);
        P.photos = P.photos.map((p) => (p.album_id === a.id ? { ...p, album_id: null } : p));
        if (P.album === a.id) P.album = null;
        sauverPhotos();
        render();
      } catch (err) { fail(err); }
    }
  });
}

// ===== 7. Gazette des grands-parents ====================================================
// Brouillon du mois : modifications pas encore enregistrées (gardées dans le téléphone).
function brouillon(mois) {
  if (!P.brouillons[mois]) {
    const g = P.gazettes.find((x) => x.mois === mois);
    P.brouillons[mois] = g ? { titre: g.titre, mot: g.mot || '', nouvelles: g.nouvelles || '', photos: [...(g.photos || [])] }
      : { titre: 'La Gazette de la Tribu', mot: '', nouvelles: nouvellesSuggerees({ membres: state.members || [], photos: P.photos, messages: S.messages(), mois }).map((n) => `• ${n}`).join('\n'), photos: choixGazette(P.photos, mois), neuf: true };
  }
  return P.brouillons[mois];
}
function basculerGazette(mois, id) {
  const b = brouillon(mois);
  const s = new Set(b.photos || []);
  if (s.has(id)) s.delete(id);
  else if (s.size >= GAZETTE_MAX) { toast(`${GAZETTE_MAX} photos au plus dans la gazette`); return; }
  else s.add(id);
  // Ordre chronologique dans la page.
  b.photos = photosDuMois(P.photos, mois).filter((p) => s.has(p.id)).map((p) => p.id);
  delete b.neuf;
  sauverBrouillons();
}
const signatureAdultes = () => {
  const adultes = (state.members || []).filter((m) => !m.naissance || (Date.now() - isoToDate(String(m.naissance).slice(0, 10))) / (365.25 * 864e5) >= 18).map((m) => m.nom);
  return adultes.length ? `${listeNoms(adultes)}` : '';
};
const famille = () => { const n = (state.members || []).map((m) => m.nom); return n.length ? `${n.join(', ')} et les toutous` : ''; };
function optionsGazette(mois, urls = {}) {
  const b = brouillon(mois);
  return {
    photos: P.photos, urls, foyerNom: state.foyer?.nom && state.foyer.nom !== 'Mon foyer' ? state.foyer.nom : '',
    numero: numeroGazette(mois, P.gazettes.map((g) => g.mois)), signature: signatureAdultes() ? `${signatureAdultes()}` : '', famille: famille(), b,
  };
}
async function apercuGazette() {
  const zone = $('#mp-gz-apercu');
  if (!zone) return;
  const b = brouillon(P.mois);
  const o = optionsGazette(P.mois);
  const choisies = (b.photos || []).map((id) => P.photos.find((p) => p.id === id)).filter(Boolean);
  o.urls = await Stockage.adresses(choisies.map((p) => p.miniature || p.chemin));
  // Aperçu : les miniatures suffisent (chemin → adresse de la miniature).
  const urls = Object.fromEntries(choisies.map((p) => [p.chemin, o.urls[p.miniature || p.chemin]]).filter(([, u]) => u));
  zone.innerHTML = gazetteHtml({ ...b, mois: P.mois }, { ...o, urls });
}

function vueGazette() {
  const mois = P.mois;
  const b = brouillon(mois);
  const g = P.gazettes.find((x) => x.mois === mois);
  const du = photosDuMois(P.photos, mois);
  queueMicrotask(() => apercuGazette());
  const etat = g?.imprimee_le ? `Imprimée le ${esc(dateLongue(g.imprimee_le))}` : g ? 'Enregistrée' : 'Pas encore enregistrée';
  return `<div class="mp-gz-mois card"><button class="icon-btn" data-act="photos-gazette-mois" data-d="-1" aria-label="Mois précédent">${ICON.back}</button>
      <div class="grow" style="text-align:center"><b>Gazette ${esc(deMois(mois))} ${mois.slice(0, 4)}</b><br><span class="muted small">${etat}</span></div>
      <button class="icon-btn" data-act="photos-gazette-mois" data-d="1" aria-label="Mois suivant" ${mois >= moisDe(new Date()) ? 'disabled' : ''}>${ICON.next}</button></div>
    <p class="muted small">Une page à imprimer chaque mois pour les grands-parents : choisis les photos, écris quelques nouvelles, puis « Imprimer ou PDF » (dans le menu d'impression de l'iPhone, écarte deux doigts sur l'aperçu pour obtenir le PDF à partager).</p>
    <h3 class="mp-mois">Photos du mois <span class="muted small">${(b.photos || []).length} / ${GAZETTE_MAX} choisies</span></h3>
    ${du.length ? vignettes(du, { choix: b.photos || [] }) : `<p class="muted small">Aucune photo datée ${esc(deMois(mois))} dans l'album.</p>`}
    <div class="stack mp-gz-form">
      <label class="field"><span>Titre</span><input class="input" data-mp-gz="titre" maxlength="60" value="${esc(b.titre || '')}"></label>
      <label class="field"><span>Le mot du mois</span><textarea class="input" data-mp-gz="mot" rows="3" maxlength="1200" placeholder="Ce mois-ci, Zoé a découvert la neige…">${esc(b.mot || '')}</textarea></label>
      <label class="field"><span>Les petites nouvelles (une par ligne)</span><textarea class="input" data-mp-gz="nouvelles" rows="5" maxlength="2000">${esc(b.nouvelles || '')}</textarea></label>
      <div class="grid2"><button class="btn" data-act="photos-gazette-enregistrer">Enregistrer</button><button class="btn primary" data-act="photos-gazette-imprimer">${icImprimer} Imprimer ou PDF</button></div>
    </div>
    <h3 class="mp-mois">Aperçu</h3>
    <div id="mp-gz-apercu" class="mp-gz-apercu"></div>`;
}

async function enregistrerGazette(extra = {}) {
  const mois = P.mois;
  const b = brouillon(mois);
  const g = P.gazettes.find((x) => x.mois === mois);
  const ligne = { ...(g ? { id: g.id } : {}), mois, titre: (b.titre || '').trim() || 'La Gazette de la Tribu', mot: (b.mot || '').trim() || null, nouvelles: (b.nouvelles || '').trim() || null, photos: b.photos || [], updated_at: new Date().toISOString(), ...extra };
  const r = await Sync.upsert(T.mp_gazettes, ligne, { onConflict: 'foyer_id,mois' });
  fusionner(P.gazettes, r);
  delete b.neuf;
  sauverPhotos();
  sauverBrouillons();
  return r;
}

// Impression : la gazette est placée seule dans la page, en A4, avec les grandes photos.
async function imprimerGazette() {
  const mois = P.mois;
  const b = brouillon(mois);
  const choisies = (b.photos || []).map((id) => P.photos.find((p) => p.id === id)).filter(Boolean);
  toast('Préparation de la gazette…');
  try { await enregistrerGazette({ imprimee_le: isoDate(new Date()) }); } catch (e) { console.warn('gazette', e); }
  const urls = await Stockage.adresses(choisies.flatMap((p) => [p.chemin, p.miniature]));
  // Hors ligne, la grande photo peut manquer : la miniature la remplace.
  const parChemin = Object.fromEntries(choisies.map((p) => [p.chemin, urls[p.chemin] || urls[p.miniature]]).filter(([, u]) => u));
  let zone = $('#mp-impression');
  if (!zone) { zone = document.createElement('div'); zone.id = 'mp-impression'; document.body.append(zone); }
  zone.innerHTML = gazetteHtml({ ...b, mois }, { ...optionsGazette(mois), urls: parChemin });
  await Promise.all($$('img', zone).map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; setTimeout(r, 8000); }))));
  document.body.classList.add('mp-imprime');
  const finir = () => { document.body.classList.remove('mp-imprime'); window.removeEventListener('afterprint', finir); };
  window.addEventListener('afterprint', finir);
  try { window.print(); } finally { setTimeout(finir, 1500); }
  if (state.tab === 'photos') render();
}

Modules.register({
  id: 'photos',
  onglet: 'famille',
  segment: 'Photos',
  ordre: 40,
  libelle: () => (P.vue === 'gazette' ? 'Gazette des grands-parents' : 'Album de famille'),
  tables: { mp_photos: 'photos_famille', mp_albums: 'photos_albums', mp_gazettes: 'photos_gazettes' },
  async charger(force, { horsLigne } = {}) {
    await chargerPhotos(horsLigne);
    if (state.tab === 'photos' && state.loaded) render();
  },
  rendu: rendrePhotos,
  actions: {
    'photos-vue': (b) => { P.vue = b.dataset.v; if (P.vue !== 'photos') P.album = null; render(); },
    'photos-voir': (b) => voirPhoto(b.dataset.id),
    'photos-album': (b) => { P.album = b.dataset.id || null; P.vue = 'photos'; render(); window.scrollTo({ top: 0 }); },
    'photos-album-nouveau': (b) => editerAlbum(null, !!b.dataset.lien),
    'photos-album-menu': (b) => menuAlbum(b.dataset.id),
    'photos-gazette-mois': (b) => { P.mois = moisDecale(P.mois, Number(b.dataset.d)); render(); },
    'photos-gazette-choisir': (b) => { basculerGazette(P.mois, b.dataset.id); render(); },
    'photos-gazette-enregistrer': async () => { try { await enregistrerGazette(); toast('Gazette enregistrée'); render(); } catch (e) { fail(e); } },
    'photos-gazette-imprimer': () => imprimerGazette().catch(fail),
    // Ouverture directe de la gazette d'un mois (depuis le fil de l'Accueil).
    'photos-gazette-ouvrir': (b) => { P.vue = 'gazette'; P.mois = b.dataset.mois || P.mois; switchTab('photos'); },
  },
  sourcesAccueil: (ctx) => {
    // Début de mois : la gazette du mois précédent attend d'être composée.
    const d = ctx.date || new Date();
    if (d.getDate() > 7) return [];
    const mois = moisDecale(moisDe(d), -1);
    if (!photosDuMois(P.photos, mois).length || P.gazettes.some((g) => g.mois === mois && g.imprimee_le)) return [];
    return [{ heure: null, titre: `La gazette ${deMois(mois)} est à composer`, detail: 'Quelques photos et nouvelles pour les grands-parents', icone: icJournal, act: 'photos-gazette-ouvrir', data: { mois } }];
  },
  notifications: [{ type: 'photo', libelle: 'Nouvelles photos', description: 'Quand des photos sont ajoutées à l\'album de famille.' }],
  expose: { dimensions: S.dimensions, qualiteSuivante: S.qualiteSuivante, fournisseurLien, moisDecale, moisLibelle, deMois, photosDuMois, choixGazette, ageTexte, nouvellesSuggerees, numeroGazette, lignesNouvelles, cheminFichier, gazetteHtml, dateLongue },
});

// Photo reprise depuis la discussion (même fichier dans le stockage).
Modules.get('photos').service = {
  async depuisMessage(ligne) {
    const ph = await Sync.upsert(T.mp_photos, { ...ligne, membres: [], auteur: monNom() });
    fusionner(P.photos, ph);
    sauverPhotos();
    return ph;
  },
};

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset?.mpGz) { const b = brouillon(P.mois); b[t.dataset.mpGz] = t.value; delete b.neuf; sauverBrouillons(); apercuGazette(); }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches?.('[data-mp-fichiers]') && t.files?.length) { ajouterPhotos(t.files); t.value = ''; }
});
