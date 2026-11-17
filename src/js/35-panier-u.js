// ---------------------------------------------------------------------------
// Panier Courses U : remplir le panier du drive en une fois.
// Chaque article est associé UNE fois à un produit Courses U (bouton 🔗, table liens_produits, colonne pid).
// L'appli ouvre coursesu.com avec la liste « numéro*quantité » dans l'ancre (#tribu-panier=…) et la copie aussi ;
// sur coursesu.com, le favori « Remplir le panier » (installé une fois) ajoute chaque produit au panier depuis la page
// elle-même : le site refuse les robots, mais accepte les demandes faites par la page, avec la session de l'utilisateur.
// Aucun identifiant ni jeton ne transite par l'appli. Le favori ne valide jamais de commande.
// ---------------------------------------------------------------------------
const PanierU = {
  // Numéro produit Courses U d'un lien mémorisé (colonne pid, sinon tiré de l'adresse …/1234567.html).
  pid(lien) { return lien ? String(lien.pid || this.pidUrl(lien.url) || '') || null : null; },
  // …/p/1234567.html, …/p/lait-demi-ecreme/1234567.html ou …/p/lait-demi-ecreme-1234567
  pidUrl(url) { return String(url || '').match(/\/p\/(?:[^?#]*?[/-])?(\d{4,})(?:\.html)?(?:[?#]|$)/)?.[1] || null; },
  // Quantité lue dans un texte : « 6x1l », « 300g », « 1,5 kg », « 4 x 125 g », « 75 cl », « boîte de 12 », « 6 œufs », « 3 ».
  // → { v, base } avec base 'g', 'ml' ou 'pièce' ; null si rien de lisible.
  mesure(texte, { nu = false } = {}) {
    const t = String(texte || '').toLowerCase().replace(/[-_]+/g, ' ').replace(/(\d),(\d)/g, '$1.$2');
    const U = { g: ['g', 1], gr: ['g', 1], kg: ['g', 1000], mg: ['g', 0.001], ml: ['ml', 1], cl: ['ml', 10], dl: ['ml', 100], l: ['ml', 1000], litre: ['ml', 1000], litres: ['ml', 1000] };
    const re = /(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|mg|gr|g|ml|cl|dl|litres?|l)(?![a-zà-ÿ])/g;
    let m, best = null;
    while ((m = re.exec(t))) {
      const [base, k] = U[m[3]];
      const v = (m[1] ? Number(m[1]) : 1) * Number(m[2]) * k;
      if (v > 0) best = { v, base }; // la dernière mention l'emporte (le nom finit souvent par le format)
    }
    if (best) return best;
    const p = t.match(/(?:boite|boîte|lot|pack|sachet|filet|barquette|plaque|bo[iî]te)\s*(?:de\s*)?(\d+)/) || t.match(/(\d+)\s*(?:oeufs|œufs|pieces|pièces|pcs|unites|unités|tranches|pots|briques|bouteilles|canettes)\b/) || t.match(/\bx\s*(\d+)\b/);
    if (p) return { v: Number(p[1]), base: 'pièce' };
    if (nu) { const n = t.trim().match(/^(\d+(?:\.\d+)?)\s*(?:pièces?|pcs|u)?$/); if (n) return { v: Number(n[1]), base: 'pièce' }; }
    return null;
  },
  // Contenance d'un produit associé : nom mémorisé, puis adresse (Courses U y met le format : …-6x1l/19539.html).
  contenance(lien) {
    if (!lien) return null;
    let slug = '';
    try { slug = decodeURIComponent(new URL(lien.url).pathname.split('/').filter(Boolean).slice(1, -1).join(' ')); } catch { /* adresse illisible */ }
    return this.mesure(lien.label) || this.mesure(slug);
  },
  // Besoin d'un article : { v, base } donné par la liste, ou texte de quantité (« 400 g », « 2 »).
  besoin(a) { return a.besoin && typeof a.besoin === 'object' ? (a.besoin.v > 0 ? a.besoin : null) : this.mesure(a.besoin, { nu: true }); },
  // Nombre de produits à mettre au panier : besoin ÷ contenance, arrondi au-dessus (5 % de marge), sinon 1.
  auto(a) {
    const b = this.besoin(a), c = this.contenance(state.links[a.cle]);
    if (!b || !c || b.base !== c.base) return { n: 1, b, c, calcule: false };
    return { n: clamp(Math.ceil(b.v / c.v - 0.05), 1, 20), b, c, calcule: true };
  },
  main(cle) { const v = store.get(`panierU:qte:${cle}`, null); return v == null ? null : clamp(parseInt(v, 10) || 1, 1, 20); },
  qte(a) { return this.main(a.cle) ?? this.auto(a).n; },
  setQte(cle, q) { if (q == null) store.set(`panierU:qte:${cle}`, null); else store.set(`panierU:qte:${cle}`, clamp(q, 1, 20)); },
  // articles : [{ cle, nom, besoin }] à acheter (non cochés, hors placard).
  repartir(articles) {
    const avec = [], sans = [];
    for (const a of articles) { const pid = this.pid(state.links[a.cle]); (pid ? avec : sans).push({ ...a, pid, lien: state.links[a.cle] }); }
    return { avec, sans };
  },
  code(avec) {
    // Un même produit pour deux articles : quantités additionnées.
    const m = new Map();
    for (const a of avec) m.set(a.pid, (m.get(a.pid) || 0) + this.qte(a));
    return [...m].map(([p, q]) => `${p}*${Math.min(q, 20)}`).join(',');
  },
};
const fmtMesure = (m) => (m ? (m.base === 'pièce' ? `${fmtNum(m.v)} pièce${m.v > 1 ? 's' : ''}` : fmtQtyBase(m.v, m.base)) : '');

// Le favori : exécuté sur coursesu.com, il ne dépend de rien d'autre que de la page (pas de variable de l'appli).
function remplirPanierCoursesU() {
  (async () => {
    if (!/(^|\.)coursesu\.com$/.test(location.hostname)) { alert('Ouvrez d’abord coursesu.com, puis touchez ce favori.'); return; }
    let brut = (location.hash.match(/tribu-panier=([\d*,]+)/) || [])[1];
    if (!brut) brut = prompt('Collez le code du panier copié depuis Tribu :') || '';
    brut = String(brut).replace(/^.*tribu-panier=/, '').trim();
    const lignes = brut.split(',').map((x) => x.split('*')).filter(([p]) => /^\d{3,12}$/.test(p)).map(([p, q]) => [p, Math.max(1, Math.min(20, parseInt(q, 10) || 1))]);
    if (!lignes.length) { alert('Aucun produit à ajouter.'); return; }
    const bandeau = document.createElement('div');
    bandeau.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;z-index:2147483647;padding:14px 16px;border-radius:12px;background:#1d1d1f;color:#fff;font:600 16px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)';
    document.body.appendChild(bandeau);
    const dire = (t) => { bandeau.textContent = t; };
    dire('Tribu : préparation du panier…');
    let jeton = (document.querySelector('input[name="csrf_token"]') || {}).value;
    if (!jeton) {
      try {
        const html = await (await fetch('/recherche?q=lait&sz=1', { credentials: 'include' })).text();
        jeton = (html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)["']/) || html.match(/value=["']([^"']{20,})["'][^>]*name=["']csrf_token["']/) || [])[1];
      } catch (e) { /* jeton introuvable : message plus bas */ }
    }
    if (!jeton) { dire('Impossible de préparer le panier : êtes-vous bien connecté à Courses U ? Rechargez la page puis réessayez.'); setTimeout(() => bandeau.remove(), 8000); return; }
    const url = '/on/demandware.store/Sites-DigitalU-Site/fr_FR/Cart-AddProduct?format=ajax';
    let ok = 0; const rates = [];
    for (let i = 0; i < lignes.length; i++) {
      const [pid, q] = lignes[i];
      dire(`Tribu : ajout ${i + 1}/${lignes.length}…`);
      const corps = new URLSearchParams({ pid, Quantity: String(q), quantity: String(q), update: 'true', fullview: 'true', location: 'search', requestedQuantity: '', modifiableOrderID: '', isLuckyProduct: 'false', pageType: 'Search result', productRecommended: 'false', productSponsored: 'false', csrf_token: jeton });
      try {
        const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: corps });
        const t = await r.text();
        let erreur = !r.ok;
        try { const j = JSON.parse(t); if (j && (j.error === true || j.success === false)) erreur = true; } catch (e) { /* réponse HTML : acceptée si 200 */ }
        if (erreur) rates.push(pid); else ok++;
      } catch (e) { rates.push(pid); }
      await new Promise((r) => setTimeout(r, 350));
    }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* sans importance */ }
    dire(`Tribu : ${ok} produit${ok > 1 ? 's' : ''} ajouté${ok > 1 ? 's' : ''} au panier${rates.length ? `, ${rates.length} indisponible${rates.length > 1 ? 's' : ''} (n° ${rates.join(', ')})` : ''}. Rechargement…`);
    setTimeout(() => location.reload(), rates.length ? 5000 : 2200);
  })();
}
const favoriPanierU = () => `javascript:${encodeURIComponent(`(${remplirPanierCoursesU.toString()})()`)}`;

// sansOuvert : rubrique « Sans produit associé » dépliée (retour après une association).
function panierUSheet(articles, { sansOuvert = false } = {}) {
  if (!state.settings.store_slug) { choisirMagasin({ ensuite: () => panierUSheet(articles, { sansOuvert }) }); return; }
  const dessiner = () => {
    const { avec, sans } = PanierU.repartir(articles);
    const code = PanierU.code(avec);
    const lien = code ? `${cuStore()}#tribu-panier=${code}` : '';
    return `${sheetHead('Remplir mon panier Courses U')}
      <p class="muted small" style="margin-top:0">${esc(state.settings.store_name)} <button class="pu-auto" data-x="magasin">changer</button> · ${avec.length} article${avec.length > 1 ? 's' : ''} prêt${avec.length > 1 ? 's' : ''}${sans.length ? `, ${sans.length} sans produit associé` : ''}.</p>
      ${avec.length ? `<div class="pu-liste">${avec.map((a) => {
          const au = PanierU.auto(a), main = PanierU.main(a.cle);
          const calc = au.calcule ? `Besoin ${esc(fmtMesure(au.b))} · produit de ${esc(fmtMesure(au.c))} → ${au.n}` : au.c ? `Produit de ${esc(fmtMesure(au.c))}${au.b ? '' : ' · quantité de la liste inconnue'}` : 'Contenance inconnue : ajoutez-la au nom du produit (🔗)';
          return `<div class="pu-ligne"><span class="grow"><b>${esc(a.nom)}</b><span class="muted small"> · ${esc(a.lien?.label || `n° ${a.pid}`)}</span>
            <button class="pu-auto pu-changer" data-x="lier" data-cle="${esc(a.cle)}" data-nom="${esc(a.nom)}">Changer de produit</button>
            <span class="pu-calc small">${calc}${main != null ? ` · <button class="pu-auto" data-x="auto" data-cle="${esc(a.cle)}">réglé à la main, revenir au calcul</button>` : ''}</span></span>
          <button class="icon-btn" data-x="moins" data-cle="${esc(a.cle)}" aria-label="Un de moins">−</button><b class="pu-q">${PanierU.qte(a)}</b><button class="icon-btn" data-x="plus" data-cle="${esc(a.cle)}" aria-label="Un de plus">${ICON.plus}</button></div>`;
        }).join('')}</div>
        <a class="btn primary block" style="margin-top:12px" data-x="ouvrir" href="${esc(lien)}" target="_blank" rel="noopener">${ICON.cart} Ouvrir Courses U et remplir</a>
        <p class="muted small" style="margin:8px 0 0">Sur la page Courses U qui s'ouvre, touchez le favori <b>Remplir le panier</b>. Le code du panier est aussi copié : si le favori le demande, collez-le.</p>`
        : '<p class="muted small">Aucun article n\'est encore associé à un produit Courses U. Associez-les ci-dessous : c\'est à faire une seule fois par article.</p>'}
      ${sans.length ? `<details class="ndetails" data-sans ${avec.length && !sansOuvert ? '' : 'open'}><summary>Sans produit associé (${sans.length})</summary>
        ${sans.map((a) => `<div class="pu-ligne"><span class="grow">${esc(a.nom)}</span><button class="btn small" data-x="lier" data-cle="${esc(a.cle)}" data-nom="${esc(a.nom)}">${ICON.link} Associer</button></div>`).join('')}</details>` : ''}
      <details class="ndetails"><summary>Première fois : installer le favori « Remplir le panier »</summary>
        <p class="small"><b>Sur iPhone (Safari)</b></p>
        <ol class="small pu-etapes"><li>Touchez <b>Copier le favori</b> ci-dessous.</li><li>Sur n'importe quelle page, touchez <b>Partager › Ajouter un signet</b>, nommez-le « Remplir le panier », enregistrez.</li>
          <li>Ouvrez les signets, touchez <b>Modifier</b>, puis ce signet : effacez l'adresse et collez celle copiée.</li></ol>
        <p class="small"><b>Sur ordinateur</b> : glissez ce bouton dans la barre des favoris : <a class="btn small" data-x="favori" href="${esc(favoriPanierU())}">Remplir le panier</a></p>
        <button class="btn block" data-x="copier-favori">${ICON.copy} Copier le favori</button>
        <p class="muted small">Le favori n'agit que sur coursesu.com, avec votre session : il ajoute les produits au panier, sans jamais valider de commande.</p>
      </details>`;
  };
  const el = openSheet(dessiner());
  if (sansOuvert) requestAnimationFrame(() => el.querySelector('[data-sans]')?.scrollIntoView({ block: 'start' }));
  const copier = async (txt, msg) => { try { await navigator.clipboard.writeText(txt); toast(msg); } catch { toast('Copie impossible sur ce navigateur'); } };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const x = b.dataset.x;
    if (x === 'favori') { e.preventDefault(); toast('Glissez ce bouton dans la barre des favoris'); return; }
    if (x === 'ouvrir') { copier(PanierU.code(PanierU.repartir(articles).avec), 'Code du panier copié'); return; }
    if (x === 'copier-favori') { copier(favoriPanierU(), 'Favori copié : collez-le comme adresse du signet'); return; }
    if (x === 'magasin') { closeSheet(); choisirMagasin({ ensuite: () => panierUSheet(articles) }); return; }
    if (x === 'lier') { closeSheet(); linkItem(b.dataset.cle, b.dataset.nom, { retour: () => panierUSheet(articles, { sansOuvert: true }) }); return; }
    if (x === 'plus' || x === 'moins' || x === 'auto') {
      const a = articles.find((y) => y.cle === b.dataset.cle);
      PanierU.setQte(b.dataset.cle, x === 'auto' ? null : PanierU.qte(a) + (x === 'plus' ? 1 : -1));
      const ouverts = [...el.querySelectorAll('details')].map((d) => d.open);
      el.innerHTML = (el.querySelector('.sheet-grip')?.outerHTML || '') + dessiner();
      el.querySelectorAll('details').forEach((d, i) => { d.open = ouverts[i] ?? d.open; });
    }
  });
}

// ---------------------------------------------------------------------------
// Magasin Courses U du foyer : demandé à la première connexion d'un nouveau foyer, puis modifiable (Paramètres, Panier U).
// ---------------------------------------------------------------------------
// « https://www.coursesu.com/drive-superu-cognin », « drive-superu-cognin » ou « superu-cognin » → « superu-cognin ».
function slugMagasin(texte) {
  const t = String(texte || '').trim().toLowerCase();
  const s = (t.match(/drive-([a-z0-9-]+)/)?.[1] || (/^[a-z0-9-]+$/.test(t) ? t.replace(/^drive-/, '') : '')).replace(/-+$/, '');
  return /^[a-z0-9-]{3,80}$/.test(s) ? s : '';
}
// « superu-cognin » → « Super U Cognin » ; « hyperu-saint-jean » → « Hyper U Saint Jean ».
function nomMagasin(slug) {
  const enseigne = { superu: 'Super U', hyperu: 'Hyper U', uexpress: 'U Express', marcheu: 'Marché U', utile: 'Utile' };
  const [t, ...reste] = String(slug || '').split('-');
  const ville = reste.join(' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return [enseigne[t] || (t ? t.replace(/^\w/, (c) => c.toUpperCase()) : ''), ville].filter(Boolean).join(' ');
}
function choisirMagasin({ ensuite } = {}) {
  const s = state.settings;
  const el = openSheet(`${sheetHead('Votre magasin Courses U')}
    <p class="muted small" style="margin-top:0">Il sert à ouvrir votre drive et à y remplir le panier depuis la liste de courses.</p>
    <ol class="small pu-etapes"><li>Ouvrez Courses U et choisissez votre magasin (bouton « Choisir mon magasin » du site).</li>
      <li>Copiez l'adresse de la page du magasin : elle contient <code>coursesu.com/drive-</code>.</li><li>Collez-la ci-dessous.</li></ol>
    <a class="btn soft block" href="https://www.coursesu.com/" target="_blank" rel="noopener">${ICON.ext} Ouvrir Courses U</a>
    <form class="stack" style="margin-top:12px" data-form="magasin">
      <label class="field"><span>Adresse du magasin</span><input class="input" name="adresse" inputmode="url" autocomplete="off" placeholder="https://www.coursesu.com/drive-…" value="${esc(s.store_slug ? `https://www.coursesu.com/drive-${s.store_slug}` : '')}"></label>
      <label class="field"><span>Nom (facultatif)</span><input class="input" name="nom" maxlength="60" placeholder="Deviné d'après l'adresse" value="${esc(s.store_name || '')}"></label>
      <button class="btn primary block">Enregistrer ce magasin</button>
      <button type="button" class="btn block" data-x="plus-tard">Plus tard</button>
    </form>`);
  const form = $('form', el);
  form.adresse.addEventListener('input', () => { const sl = slugMagasin(form.adresse.value); if (sl && !form.nom.dataset.touche) form.nom.value = nomMagasin(sl); });
  form.nom.addEventListener('input', () => { form.nom.dataset.touche = '1'; });
  $('[data-x="plus-tard"]', el).addEventListener('click', () => closeSheet());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const slug = slugMagasin(form.adresse.value);
    if (!slug) { toast('Collez l\'adresse de la page du magasin (coursesu.com/drive-…)'); return; }
    try {
      await Data.saveSettings({ store_slug: slug, store_name: form.nom.value.trim() || nomMagasin(slug) });
      closeSheet(); render(); toast('Magasin enregistré');
      if (ensuite) setTimeout(ensuite, 320);
    } catch (err) { fail(err); }
  });
}
// Première connexion d'un foyer sans magasin : demandé une fois par appareil (« Plus tard » ne revient pas à chaque ouverture).
function demanderMagasinSiBesoin() {
  if (state.settings.store_slug || !foyer()) return;
  const cle = `magasin:demande:${foyer()}`;
  if (store.get(cle, false)) return;
  store.set(cle, true);
  setTimeout(() => { if (!sheets.length && !state.settings.store_slug) choisirMagasin(); }, 1500);
}
