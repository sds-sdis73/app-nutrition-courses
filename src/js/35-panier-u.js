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
  qte(cle) { return clamp(parseInt(store.get(`panierU:qte:${cle}`, 1), 10) || 1, 1, 20); },
  setQte(cle, q) { store.set(`panierU:qte:${cle}`, clamp(q, 1, 20)); },
  // articles : [{ cle, nom }] à acheter (non cochés, hors placard).
  repartir(articles) {
    const avec = [], sans = [];
    for (const a of articles) { const pid = this.pid(state.links[a.cle]); (pid ? avec : sans).push({ ...a, pid, lien: state.links[a.cle] }); }
    return { avec, sans };
  },
  code(avec) {
    // Un même produit pour deux articles : quantités additionnées.
    const m = new Map();
    for (const a of avec) m.set(a.pid, (m.get(a.pid) || 0) + this.qte(a.cle));
    return [...m].map(([p, q]) => `${p}*${Math.min(q, 20)}`).join(',');
  },
};

// Le favori : exécuté sur coursesu.com, il ne dépend de rien d'autre que de la page (pas de variable de l'appli).
function remplirPanierCoursesU() {
  (async () => {
    if (!/(^|\.)coursesu\.com$/.test(location.hostname)) { alert('Ouvrez d’abord coursesu.com, puis touchez ce favori.'); return; }
    let brut = (location.hash.match(/tribu-panier=([\d*,]+)/) || [])[1];
    if (!brut) brut = prompt('Collez le code du panier copié depuis Tribu & Toutous :') || '';
    brut = String(brut).replace(/^.*tribu-panier=/, '').trim();
    const lignes = brut.split(',').map((x) => x.split('*')).filter(([p]) => /^\d{3,12}$/.test(p)).map(([p, q]) => [p, Math.max(1, Math.min(20, parseInt(q, 10) || 1))]);
    if (!lignes.length) { alert('Aucun produit à ajouter.'); return; }
    const bandeau = document.createElement('div');
    bandeau.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;z-index:2147483647;padding:14px 16px;border-radius:12px;background:#1d1d1f;color:#fff;font:600 16px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)';
    document.body.appendChild(bandeau);
    const dire = (t) => { bandeau.textContent = t; };
    dire('Tribu & Toutous : préparation du panier…');
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
      dire(`Tribu & Toutous : ajout ${i + 1}/${lignes.length}…`);
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
    dire(`Tribu & Toutous : ${ok} produit${ok > 1 ? 's' : ''} ajouté${ok > 1 ? 's' : ''} au panier${rates.length ? `, ${rates.length} indisponible${rates.length > 1 ? 's' : ''} (n° ${rates.join(', ')})` : ''}. Rechargement…`);
    setTimeout(() => location.reload(), rates.length ? 5000 : 2200);
  })();
}
const favoriPanierU = () => `javascript:${encodeURIComponent(`(${remplirPanierCoursesU.toString()})()`)}`;

function panierUSheet(articles) {
  const dessiner = () => {
    const { avec, sans } = PanierU.repartir(articles);
    const code = PanierU.code(avec);
    const lien = code ? `${cuStore()}#tribu-panier=${code}` : '';
    return `${sheetHead('Remplir mon panier Courses U')}
      <p class="muted small" style="margin-top:0">${esc(state.settings.store_name)} · ${avec.length} article${avec.length > 1 ? 's' : ''} prêt${avec.length > 1 ? 's' : ''}${sans.length ? `, ${sans.length} sans produit associé` : ''}.</p>
      ${avec.length ? `<div class="pu-liste">${avec.map((a) => `<div class="pu-ligne"><span class="grow"><b>${esc(a.nom)}</b><span class="muted small"> · ${esc(a.lien?.label || `n° ${a.pid}`)}</span></span>
          <button class="icon-btn" data-x="moins" data-cle="${esc(a.cle)}" aria-label="Un de moins">−</button><b class="pu-q">${PanierU.qte(a.cle)}</b><button class="icon-btn" data-x="plus" data-cle="${esc(a.cle)}" aria-label="Un de plus">${ICON.plus}</button></div>`).join('')}</div>
        <a class="btn primary block" style="margin-top:12px" data-x="ouvrir" href="${esc(lien)}" target="_blank" rel="noopener">${ICON.cart} Ouvrir Courses U et remplir</a>
        <p class="muted small" style="margin:8px 0 0">Sur la page Courses U qui s'ouvre, touchez le favori <b>Remplir le panier</b>. Le code du panier est aussi copié : si le favori le demande, collez-le.</p>`
        : '<p class="muted small">Aucun article n\'est encore associé à un produit Courses U. Associez-les ci-dessous : c\'est à faire une seule fois par article.</p>'}
      ${sans.length ? `<details class="ndetails" ${avec.length ? '' : 'open'}><summary>Sans produit associé (${sans.length})</summary>
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
  const copier = async (txt, msg) => { try { await navigator.clipboard.writeText(txt); toast(msg); } catch { toast('Copie impossible sur ce navigateur'); } };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const x = b.dataset.x;
    if (x === 'favori') { e.preventDefault(); toast('Glissez ce bouton dans la barre des favoris'); return; }
    if (x === 'ouvrir') { copier(PanierU.code(PanierU.repartir(articles).avec), 'Code du panier copié'); return; }
    if (x === 'copier-favori') { copier(favoriPanierU(), 'Favori copié : collez-le comme adresse du signet'); return; }
    if (x === 'lier') { closeSheet(); linkItem(b.dataset.cle, b.dataset.nom); return; }
    if (x === 'plus' || x === 'moins') {
      PanierU.setQte(b.dataset.cle, PanierU.qte(b.dataset.cle) + (x === 'plus' ? 1 : -1));
      const ouverts = [...el.querySelectorAll('details')].map((d) => d.open);
      el.innerHTML = (el.querySelector('.sheet-grip')?.outerHTML || '') + dessiner();
      el.querySelectorAll('details').forEach((d, i) => { d.open = ouverts[i] ?? d.open; });
    }
  });
}
