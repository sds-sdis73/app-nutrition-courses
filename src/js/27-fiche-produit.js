// ---------------------------------------------------------------------------
// Fiche produit
// ---------------------------------------------------------------------------
// Produit saisi à la main : même forme qu'un produit Open Food Facts pour réutiliser offPer100().
const persoToProduct = (x) => ({ code: x.ean || `perso:${x.id}`, product_name: x.name, brands: x.brand || '', serving_quantity: x.serving_g || null, _perso: x, nutriments: Object.fromEntries(Object.entries({ 'energy-kcal_100g': x.n.kcal, proteins_100g: x.n.prot, carbohydrates_100g: x.n.gluc, sugars_100g: x.n.suc, fat_100g: x.n.lip, 'saturated-fat_100g': x.n.ags, fiber_100g: x.n.fib, salt_100g: x.n.sel }).map(([k, v]) => [k, Number(v) || 0])) });
function persoSheet(init, onDone) {
  const x = { name: '', brand: '', ean: null, serving_g: '', n: {}, ...init };
  const fields = [['kcal', 'Énergie (kcal)'], ['prot', 'Protéines (g)'], ['gluc', 'Glucides (g)'], ['suc', 'dont sucres (g)'], ['lip', 'Lipides (g)'], ['ags', 'dont AG saturés (g)'], ['fib', 'Fibres (g)'], ['sel', 'Sel (g)']];
  const el = openSheet(`${sheetHead(x.id ? 'Modifier la fiche' : 'Nouvelle fiche produit')}
    <form class="stack" data-form="perso">
      <label class="field"><span>Nom du produit</span><input class="input" name="name" value="${esc(x.name)}" required maxlength="200"></label>
      <div class="grid2"><label class="field"><span>Marque</span><input class="input" name="brand" value="${esc(x.brand || '')}"></label>
        <label class="field"><span>Code-barres</span><input class="input" name="ean" inputmode="numeric" value="${esc(x.ean || '')}" placeholder="facultatif"></label></div>
      <p class="muted small" style="margin:0">Valeurs de l'étiquette <b>pour 100 g</b> (ou 100 ml) :</p>
      <div class="grid2">${fields.map(([k, l]) => `<label class="field"><span>${l}</span><input class="input" type="number" step="any" min="0" inputmode="decimal" name="${k}" value="${esc(x.n[k] ?? '')}" ${k === 'kcal' ? 'required' : ''}></label>`).join('')}</div>
      <label class="field"><span>Poids d'une portion (g, facultatif)</span><input class="input" type="number" step="any" min="0" inputmode="decimal" name="serving_g" value="${esc(x.serving_g || '')}"></label>
      <button class="btn primary block">Enregistrer</button>
      ${x.id ? '<button type="button" class="btn danger block" data-x="del">Supprimer la fiche</button>' : ''}
    </form>`);
  const f = $('form', el);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = {};
    for (const [k] of fields) n[k] = parseFloat(f[k].value) || 0;
    const row = { ...(x.id ? { id: x.id } : {}), name: f.name.value.trim(), brand: f.brand.value.trim() || null, ean: f.ean.value.trim() || null, n, serving_g: parseFloat(f.serving_g.value) || null };
    try { const saved = await Data.savePerso(row); closeSheet(); toast('Fiche enregistrée'); onDone?.(saved); } catch (err) { fail(err, 'Enregistrement impossible'); }
  });
  $('[data-x="del"]', el)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Supprimer cette fiche produit ?', 'Supprimer'))) return;
    try { await Data.deletePerso(x.id); closeSheet(); closeSheet(); } catch (err) { fail(err); }
  });
}
function showPerso(x, { onPick } = {}) {
  const p = persoToProduct(x);
  const el = openSheet(`<div class="prod-head"><div class="ph thumb">${ICON.edit}</div>
      <div class="grow"><div class="prod-name" style="font-size:19px">${esc(x.name)}</div><div class="muted small">${esc(x.brand || '')}${x.ean ? ` · ${esc(x.ean)}` : ''} · fiche manuelle</div></div>
      <button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${ICON.close}</button></div>
    ${onPick ? `<button class="btn primary block" style="margin-top:14px" data-x="pick">${ICON.plus} Ajouter comme ingrédient</button>` : state.members.length ? `<button class="btn soft block" style="margin-top:14px" data-x="journal">${ICON.plus} Ajouter à mon journal</button>` : ''}
    ${nutriTable(offPer100(p), { title: 'Pour 100 g' })}
    ${x.serving_g ? nutriTable(scaleN(offPer100(p), x.serving_g / 100), { title: `Par portion (${fmtNum(x.serving_g)} g)` }) : ''}
    <button class="btn block" data-x="edit">${ICON.edit} Modifier la fiche</button>
    <p class="muted small">Valeurs saisies à la main depuis l'étiquette : pas de note sur 100 ni d'alternatives.</p>`);
  $('[data-x="pick"]', el)?.addEventListener('click', () => { closeSheet(); onPick(p, null); });
  $('[data-x="journal"]', el)?.addEventListener('click', () => quantitySheet({ label: x.name, per100: offPer100(p), source: 'off', ref: `perso:${x.id}`, defaultGrams: Number(x.serving_g) || 100 }));
  $('[data-x="edit"]', el).addEventListener('click', () => persoSheet(x, (saved) => { closeSheet(); showPerso(saved, { onPick }); }));
}
let compareBase = null;
async function showProduct(ean, { onPick, record = true, compareTo = null } = {}) {
  const el = openSheet(`<div class="spinner"></div><p class="muted" style="text-align:center">Recherche du produit…</p>`);
  let p;
  try {
    p = await fetchProduct(ean);
  } catch (e) {
    el.innerHTML = `${sheetHead('Connexion impossible')}<p class="muted">Open Food Facts ne répond pas. Réessayez dans un instant.</p>
      <button class="btn primary block" data-act="retry-product" data-ean="${esc(ean)}">Réessayer</button>`;
    return;
  }
  if (!p) {
    const perso = state.perso.find((x) => x.ean === ean);
    if (perso) { closeSheet(); return showPerso(perso, { onPick }); }
    el.innerHTML = `${sheetHead('Produit introuvable')}<p>Le code <b>${esc(ean)}</b> n'est pas encore dans la base Open Food Facts.</p>
      <button class="btn primary block" data-x="perso">${ICON.plus} Créer une fiche à partir de l'étiquette</button>
      <p class="muted small" style="margin:12px 0 6px">La fiche sera réutilisée à chaque scan de ce code et utilisable dans le journal et les recettes.</p>
      <a class="btn soft block" target="_blank" rel="noopener" href="https://fr.openfoodfacts.org/produit/${encodeURIComponent(ean)}">${ICON.ext} Voir sur Open Food Facts</a>`;
    $('[data-x="perso"]', el).addEventListener('click', () => { closeSheet(); persoSheet({ ean }, (x) => showPerso(x, { onPick })); });
    return;
  }
  const sc = computeScore(p);
  const name = p.product_name_fr || p.product_name || 'Produit sans nom';
  if (!compareTo) compareBase = p;
  if (record) Data.addScan(p, sc.total).then(() => state.tab === 'scan' && render()).catch((e) => console.warn(e));
  const img = safeUrl(p.image_front_url || p.image_front_small_url);
  const { defects, qualities } = sc.total == null ? { defects: [], qualities: [] } : analyse(p, sc);
  const risky = sc.additives?.filter((a) => a.risk >= 0) || [];
  const nova = { 1: 'Aliment non transformé', 2: 'Ingrédient culinaire', 3: 'Aliment transformé', 4: 'Ultra-transformé' }[p.nova_group];
  el.innerHTML = `
    <div class="prod-head">
      ${img ? `<img src="${esc(img)}" alt="">` : `<div class="ph thumb">${ICON.barcode}</div>`}
      <div class="grow"><div class="prod-name" style="font-size:19px">${esc(name)}</div>
        <div class="muted small">${esc(p.brands || '')}${p.quantity ? ` · ${esc(p.quantity)}` : ''}</div>
        ${scoreHtml(sc.total, 'big-score')}${sc.total == null ? '<div class="muted small">Données nutritionnelles insuffisantes</div>' : ''}
      </div>
      <button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${ICON.close}</button>
    </div>
    ${onPick ? `<button class="btn primary block" style="margin-top:14px" data-act="pick-product">${ICON.plus} Ajouter comme ingrédient</button>`
      : state.members.length ? `<button class="btn soft block" style="margin-top:14px" data-x="journal">${ICON.plus} Ajouter à mon journal</button>` : ''}
    <div class="analysis">
      ${defects.length ? `<h3>Défauts <span>pour 100 ${isBeverage(p) ? 'ml' : 'g'}</span></h3>${defects.map(critHtml).join('')}` : ''}
      ${qualities.length ? `<h3>Qualités <span>pour 100 ${isBeverage(p) ? 'ml' : 'g'}</span></h3>${qualities.map(critHtml).join('')}` : ''}
      ${risky.length ? `<h3>Additifs</h3>${risky.map((a) => `<div class="crit"><div class="ico">${ICON.flask}</div><div class="lbl">${esc(a.code)}</div>
        <div class="val lvl-${RISK[a.risk].lvl}">${RISK[a.risk].label}<span class="dot"></span></div><div class="sub">${esc(a.name)}</div></div>`).join('')}` : ''}
      ${sc.total != null ? `<h3>Détail de la note</h3>
        <div class="crit"><div class="ico">${ICON.apple}</div><div class="lbl">Qualité nutritionnelle</div><div class="val">${sc.nutri}/60</div><div class="sub">Nutri-Score ${sc.grade.toUpperCase()}</div></div>
        <div class="crit"><div class="ico">${ICON.flask}</div><div class="lbl">Additifs</div><div class="val">${sc.add}/30</div><div class="sub">${sc.additives.length} additif(s)${sc.total <= 49 && sc.additives.some((a) => a.risk === 3) ? ' · note plafonnée à 49' : ''}</div></div>
        <div class="crit"><div class="ico">${ICON.leaf}</div><div class="lbl">Bio</div><div class="val">${sc.bio}/10</div><div class="sub">${sc.bio ? 'Label bio' : 'Non bio'}</div></div>` : ''}
      ${nova ? `<p class="muted small" style="margin-top:12px">Transformation : NOVA ${p.nova_group} — ${nova}</p>` : ''}
    </div>
    ${compareTo ? `<h3 class="section-title">Par rapport à « ${esc(compareTo.product_name_fr || compareTo.product_name || 'produit scanné')} »</h3>${compareHtml(compareTo, p)}
      <button class="btn small block" data-x="hide-alt" style="border:0;color:var(--muted)">Ce n'est pas une alternative pertinente</button>` : ''}
    ${p.nutriments && typeof p.nutriments['energy-kcal_100g'] === 'number' ? `<h3 class="section-title">Valeurs nutritionnelles</h3>
      ${nutriTable(offPer100(p), { title: `Pour 100 ${isBeverage(p) ? 'ml' : 'g'}` })}
      ${Number(p.serving_quantity) ? nutriTable(scaleN(offPer100(p), Number(p.serving_quantity) / 100), { title: `Par portion (${esc(p.serving_size || `${p.serving_quantity} g`)})` }) : ''}` : ''}
    <div id="alts"><h3 class="section-title">Alternatives plus saines</h3><div class="spinner"></div></div>
    <p class="muted small">Données : Open Food Facts (licence ODbL). Méthode de notation inspirée de Yuka : 60 % nutrition, 30 % additifs, 10 % bio.</p>`;
  if (onPick) $('[data-act="pick-product"]', el).addEventListener('click', () => { closeSheet(); onPick(p, sc.total); });
  $('[data-x="hide-alt"]', el)?.addEventListener('click', () => {
    const h = store.get('hiddenAlts', []);
    h.push(`${compareTo.code}:${p.code}`);
    store.set('hiddenAlts', h.slice(-300));
    closeSheet();
    toast('Alternative masquée');
    topSheet()?._refreshAlts?.();
  });
  $('[data-x="journal"]', el)?.addEventListener('click', () => quantitySheet({
    label: name, per100: offPer100(p), source: 'off', ref: p.code, defaultGrams: Number(p.serving_quantity) || 100,
  }));

  el._refreshAlts = () => findAlternatives(p, sc.total).then((alts) => {
    const box = $('#alts', el);
    if (!box) return;
    box.innerHTML = `<h3 class="section-title">Alternatives plus saines</h3>${alts.length
      ? `<div class="alt-scroll">${alts.map((a) => {
        const ai = safeUrl(a.image_front_small_url || a.image_front_url);
        return `<button class="alt-card" data-act="open-alt" data-ean="${esc(a.code)}">${ai ? `<img src="${esc(ai)}" alt="" loading="lazy">` : `<div class="ph">${ICON.barcode}</div>`}
          <div class="prod-name small">${esc(a.product_name_fr || a.product_name)}</div><div class="muted small">${esc((a.brands || '').split(',')[0])}</div>
          ${scoreHtml(a._s)}${isU(a) ? '<span class="badge-u">Chez U</span>' : ''}</button>`;
      }).join('')}</div>`
      : `<p class="muted">${sc.total != null && sc.total >= 75 ? 'Ce produit est déjà excellent.' : 'Aucune alternative comparable et mieux notée trouvée.'}</p>`}
      ${alts.length ? '<p class="muted small">Alternatives de la même famille de produits (catégorie et profil nutritionnel proches), triées par note ; celles vendues chez U en premier.</p>' : ''}`;
  }).catch(() => { const box = $('#alts', el); if (box) box.innerHTML = '<p class="muted">Alternatives indisponibles pour le moment.</p>'; });
  el._refreshAlts();
}

