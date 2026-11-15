// ---------------------------------------------------------------------------
// Open Food Facts
// ---------------------------------------------------------------------------
async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      const type = r.headers.get('content-type') || '';
      if (type.includes('json')) return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
    }
    await sleep(700 * (i + 1));
  }
  throw new Error('Open Food Facts indisponible');
}
async function fetchProduct(ean) {
  const d = await fetchJson(`${OFF}/product/${encodeURIComponent(ean)}.json?fields=${OFF_FIELDS}`);
  return d.status === 1 && d.product ? { ...d.product, code: d.product.code || ean } : null;
}
const isU = (p) => (p.stores_tags || []).some((s) => /(^|[-\s])u($|[-\s])|super-?u|hyper-?u|magasins-?u|systeme-?u|courses-?u|u-express/i.test(s));

// Catégories trop larges pour comparer des produits entre eux.
const GENERIC_CATS = new Set(['en:breakfasts', 'en:spreads', 'en:sweet-spreads', 'en:salty-spreads', 'en:snacks', 'en:sweet-snacks', 'en:salty-snacks', 'en:beverages', 'en:dairies', 'en:meals', 'en:plant-based-foods-and-beverages', 'en:plant-based-foods', 'en:fruits-and-vegetables-based-foods', 'en:cereals-and-potatoes', 'en:meats', 'en:meats-and-their-products', 'en:fishes', 'en:seafood', 'en:frozen-foods', 'en:desserts', 'en:groceries', 'en:canned-foods', 'en:condiments', 'en:sauces', 'en:fats', 'en:fermented-foods', 'en:fermented-milk-products', 'en:biscuits-and-cakes', 'en:confectioneries', 'en:cereals-and-their-products', 'en:farming-products', 'en:non-alcoholic-beverages', 'en:carbonated-drinks', 'en:dairy-drinks', 'en:cheeses', 'en:cooked-meats', 'en:prepared-meats', 'en:legumes-and-their-products', 'en:nuts-and-their-products', 'en:seeds', 'en:vegetables-based-foods', 'en:fruits-based-foods', 'en:bakery', 'en:breads', 'en:pastas', 'en:cereal-grains', 'en:fruit-juices-and-nectars']);
const altCache = { get(k) { const v = store.get(`alt:${k}`, null); return v && Date.now() - v.t < 864e5 ? v.d : null; }, set(k, d) { store.set(`alt:${k}`, { t: Date.now(), d }); } };
const hiddenAlts = () => new Set(store.get('hiddenAlts', []));
function altCategories(p) {
  const specific = (p.categories_hierarchy || p.categories_tags || []).filter((t) => /^en:[a-z0-9-]+$/.test(t) && !GENERIC_CATS.has(t));
  const cats = [];
  const cmp = p.compared_to_category;
  if (cmp && /^en:[a-z0-9-]+$/.test(cmp) && !GENERIC_CATS.has(cmp)) cats.push(cmp);
  for (const c of specific.slice().reverse()) if (!cats.includes(c)) cats.push(c);
  return cats.slice(0, 3);
}
// Même famille : profils en graisses et protéines proches (une confiture n'est pas une alternative à une pâte à tartiner).
function sameFamily(a, b) {
  const na = a.nutriments || {};
  const nb = b.nutriments || {};
  const fa = Number(na.fat_100g) || 0;
  const fb = Number(nb.fat_100g) || 0;
  const pa = Number(na.proteins_100g) || 0;
  const pb = Number(nb.proteins_100g) || 0;
  return Math.abs(fa - fb) <= Math.max(8, fa * 0.5) && Math.abs(pa - pb) <= Math.max(6, pa * 0.5);
}
async function findAlternatives(p, current) {
  const hidden = hiddenAlts();
  for (const cat of altCategories(p)) {
    const key = `${cat}|${p.code}`;
    let d = altCache.get(key);
    if (!d) {
      const url = `${OFF}/search?categories_tags=${encodeURIComponent(cat)}&countries_tags=en:france&sort_by=nutriscore_score&page_size=80&fields=${OFF_FIELDS}`;
      d = await fetchJson(url);
      altCache.set(key, { products: (d.products || []).slice(0, 80) });
      d = altCache.get(key);
    }
    const list = (d.products || [])
      .filter((x) => x.code !== p.code && (x.product_name_fr || x.product_name) && !hidden.has(`${p.code}:${x.code}`))
      .filter((x) => (x.categories_tags || []).includes(cat) && sameFamily(p, x))
      .map((x) => ({ ...x, _s: computeScore(x).total }))
      .filter((x) => x._s != null && x._s >= Math.min(75, (current ?? 0) + 10));
    if (list.length) {
      list.sort((a, b) => (isU(b) - isU(a)) || (b._s - a._s));
      return list.slice(0, 12);
    }
  }
  return [];
}
// Tableau « produit scanné / alternative » sur les critères qui font la note.
function compareHtml(base, alt) {
  const nb = offPer100(base);
  const na = offPer100(alt);
  const sb = computeScore(base);
  const sa = computeScore(alt);
  const rows = [
    ['Note', `${sb.total ?? '—'}/100`, `${sa.total ?? '—'}/100`, (sa.total ?? 0) - (sb.total ?? 0), true],
    ['Calories', fmtN(nb.kcal, 'kcal'), fmtN(na.kcal, 'kcal'), nb.kcal - na.kcal, false],
    ['Sucres', fmtN(nb.suc, 'g'), fmtN(na.suc, 'g'), nb.suc - na.suc, false],
    ['Graisses saturées', fmtN(nb.ags, 'g'), fmtN(na.ags, 'g'), nb.ags - na.ags, false],
    ['Sel', fmtN(nb.sel, 'g'), fmtN(na.sel, 'g'), nb.sel - na.sel, false],
    ['Fibres', fmtN(nb.fib, 'g'), fmtN(na.fib, 'g'), na.fib - nb.fib, false],
    ['Protéines', fmtN(nb.prot, 'g'), fmtN(na.prot, 'g'), na.prot - nb.prot, false],
    ['Additifs à risque', String(sb.additives?.filter((a) => a.risk > 0).length ?? 0), String(sa.additives?.filter((a) => a.risk > 0).length ?? 0), (sb.additives?.filter((a) => a.risk > 0).length ?? 0) - (sa.additives?.filter((a) => a.risk > 0).length ?? 0), false],
    ['Bio', sb.bio ? 'oui' : 'non', sa.bio ? 'oui' : 'non', (sa.bio ? 1 : 0) - (sb.bio ? 1 : 0), false],
  ];
  return `<div class="ntable cmp"><div class="nt-title">Comparaison pour 100 g</div>
    <div class="nt-row head"><span>&nbsp;</span><b class="muted small">Scanné</b><b class="muted small">Celui-ci</b><span></span></div>
    ${rows.map(([l, a, b, better]) => `<div class="nt-row"><span>${l}</span><b>${a}</b><b>${b}</b><span class="${better > 0.05 ? 'up' : better < -0.05 ? 'down' : ''}">${better > 0.05 ? '▲' : better < -0.05 ? '▼' : '='}</span></div>`).join('')}
    <p class="muted small" style="margin:6px 0 0">▲ meilleur que le produit scanné, ▼ moins bon.</p></div>`;
}

