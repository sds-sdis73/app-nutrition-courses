// ---------------------------------------------------------------------------
// Onglet Scan
// ---------------------------------------------------------------------------
function renderScan() {
  const f = state.scanFilter;
  const list = state.scans.filter((s) => f === 'tous' || scoreLevel(s.score).lvl === f);
  return `
    <section class="scan-hero">
      <h2>Scannez un produit</h2>
      <p>Découvrez sa note sur 100 et des alternatives plus saines.</p>
      <button class="btn" data-act="scan">${ICON.barcode} Scanner un code-barres</button>
      <form class="manual" data-form="ean-inline"><input class="input grow" name="ean" inputmode="numeric" pattern="\\d{8,14}" placeholder="ou saisir le code…" aria-label="Code-barres"><button class="btn">Voir</button></form>
    </section>
    <div class="row" style="margin-top:22px"><h2 class="grow" style="font-size:18px;margin:0">Historique</h2>
      ${state.scans.length ? '<button class="btn small" data-act="clear-scans" style="border:0">Effacer</button>' : ''}</div>
    <div class="chips" style="margin-top:8px">${[['tous', 'Tous'], ['excellent', 'Excellent'], ['bon', 'Bon'], ['mediocre', 'Médiocre'], ['mauvais', 'Mauvais']]
      .map(([k, l]) => `<button class="chip lvl-${k}" aria-pressed="${f === k}" data-act="scan-filter" data-v="${k}">${k !== 'tous' ? '<span class="dot"></span>' : ''}${l}</button>`).join('')}</div>
    ${list.length ? list.map((s) => {
      const img = safeUrl(s.image_url);
      return `<button class="prod-row" data-act="open-product" data-ean="${esc(s.ean)}">${img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">` : `<div class="thumb ph">${ICON.barcode}</div>`}
        <div class="grow"><div class="prod-name">${esc(s.name || s.ean)}</div><div class="muted small">${esc((s.brand || '').split(',')[0])}</div>${scoreHtml(s.score)}</div></button>`;
    }).join('') : `<div class="empty">${ICON.barcode}<p>${state.scans.length ? 'Aucun produit dans ce filtre.' : 'Vos produits scannés apparaîtront ici.'}</p></div>`}`;
}

