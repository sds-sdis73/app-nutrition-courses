// ---------------------------------------------------------------------------
// Budget : prix par code-barres (Open Prices), lecture Courses U (tentative), saisie manuelle
// ---------------------------------------------------------------------------
const Prices = {
  mem: new Map(),
  pending: new Set(),
  // Prix médian des relevés Open Prices (EUR, à l'unité, 12 derniers mois).
  async open(ean) {
    if (!/^\d{8,14}$/.test(ean || '')) return null;
    if (this.mem.has(ean)) return this.mem.get(ean);
    const cached = store.get(`op:${ean}`, null);
    if (cached && Date.now() - cached.t < 7 * 864e5) { this.mem.set(ean, cached.p); return cached.p; }
    if (this.pending.has(ean)) return null;
    this.pending.add(ean);
    try {
      const r = await fetch(`https://prices.openfoodfacts.org/api/v1/prices?product_code=${encodeURIComponent(ean)}&order_by=-date&size=50`);
      const d = r.ok ? await r.json() : { items: [] };
      const limit = isoDate(addDays(new Date(), -365));
      const vals = (d.items || []).filter((x) => x.currency === 'EUR' && x.price_per !== 'KILOGRAM' && x.price > 0 && (x.date || '') >= limit).map((x) => Number(x.price)).sort((a, b) => a - b);
      const p = vals.length ? { price: Math.round(vals[Math.floor(vals.length / 2)] * 100) / 100, n: vals.length, source: 'openprices' } : { price: null, n: 0, source: 'openprices' };
      this.mem.set(ean, p);
      store.set(`op:${ean}`, { t: Date.now(), p });
      return p;
    } catch { this.mem.set(ean, { price: null, n: 0, source: 'openprices', failed: Date.now() }); return null; } finally { this.pending.delete(ean); }
  },
  // Lecture serveur du prix Courses U (souvent bloquée par le site : résultat nul possible).
  async coursesU(url) {
    try {
      const { data, error } = await db.functions.invoke('prix-coursesu', { body: { url, store_slug: state.settings.store_slug } });
      if (error) return { price: null, reason: 'fonction indisponible' };
      return data || { price: null };
    } catch { return { price: null, reason: 'réseau' }; }
  },
  // Prix d'un article de la liste : mémorisé (manuel ou Courses U) sinon Open Prices (cache).
  of(it) {
    const link = state.links[it.ingKey];
    if (link?.prix) return { price: Number(link.prix), source: link.prix_source || 'manuel', date: link.prix_date };
    const ean = link?.ean || it.ean;
    if (ean) { const op = this.mem.get(ean) || store.get(`op:${ean}`, null)?.p; if (op?.price) return { price: op.price, source: 'openprices', n: op.n }; }
    return null;
  },
  // Lance les recherches manquantes puis redessine la liste.
  warm(items) {
    const eans = [...new Set(items.map((it) => state.links[it.ingKey]?.ean || it.ean).filter((e) => e && !this.mem.has(e) && !store.get(`op:${e}`, null)))];
    if (!eans.length) return;
    Promise.all(eans.slice(0, 12).map((e) => this.open(e))).then((res) => { if (state.tab === 'courses' && res.some((p) => p?.price)) render(); });
  },
};
const fmtEur = (v) => `${v.toFixed(2).replace('.', ',')} €`;
const PRICE_SRC = { manuel: 'prix saisi', coursesu: 'prix Courses U', openprices: 'prix moyen relevé (Open Prices)' };

