// ---------------------------------------------------------------------------
// Mises à jour : version.json est relu sans cache ; si la version publiée diffère,
// la page est rechargée avec une URL nouvelle pour contourner le cache du navigateur.
// ---------------------------------------------------------------------------
// Cache local des données (dernier chargement) et file d'attente des saisies hors ligne.
const Offline = {
  key: (k) => `cache:${foyer() || 'x'}:${k}`,
  saveAll() { store.set(this.key('all'), { settings: state.settings, recipes: state.recipes, links: state.links, scans: state.scans.slice(0, 60), members: state.members, placards: state.placards, restes: state.restes, favoris: state.favoris, perso: state.perso }); },
  saveWeek() { store.set(this.key(`week:${isoDate(state.week)}`), { plan: state.plan, checks: state.checks, extras: state.extras, journal: state.journal }); },
  restoreAll() { const c = store.get(this.key('all'), null); if (c) Object.assign(state, c); return !!c; },
  restoreWeek() { const c = store.get(this.key(`week:${isoDate(state.week)}`), null); Object.assign(state, c || { plan: [], checks: {}, extras: [], journal: [] }); return !!c; },
};
const Queue = {
  list: () => store.get('queue', []),
  size() { return this.list().length; },
  push(op) { const l = this.list(); l.push({ ...op, t: Date.now() }); store.set('queue', l); },
  remove(lid) { store.set('queue', this.list().filter((op) => op.lid !== lid)); },
  flushing: null,
  // Envoie les saisies en attente une par une ; chacune n'est retirée de la file qu'après succès. Renvoie le nombre envoyé.
  async flush() {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      let done = 0;
      for (const op of this.list()) {
        if (!navigator.onLine) break;
        try {
          if (op.type === 'journal') { const { error } = await db.from(T.journal).insert(op.row); if (error) throw error; }
          if (op.type === 'scan') { const { error } = await db.from(T.scans).insert(op.row); if (error) throw error; }
          if (op.type === 'forme') { const { error } = await db.from(op.table).upsert(op.row, { onConflict: op.onConflict || 'id' }); if (error) throw error; }
          if (op.type === 'forme-del') { const { error } = await db.from(op.table).delete().eq('id', op.id); if (error) throw error; }
          // Opérations génériques des modules (Sync.upsert / Sync.supprimer).
          if (op.type === 'upsert') { const { error } = await db.from(op.table).upsert(op.row, { onConflict: op.onConflict || 'id' }); if (error) throw error; }
          if (op.type === 'delete') { const { error } = await db.from(op.table).delete().eq('id', op.id); if (error) throw error; }
          if (op.type === 'act') { const { error } = await db.from(T.activites).upsert(op.row, { onConflict: 'member_id,date,source,ref' }); if (error) throw error; }
          if (op.type === 'act-del') { const { error } = await db.from(T.activites).delete().eq('member_id', op.member_id).eq('source', 'forme').eq('ref', op.ref); if (error) throw error; }
          store.set('queue', this.list().filter((x) => x.t !== op.t));
          if (op.lid) state.journal = state.journal.filter((x) => x.id !== op.lid);
          done++;
        } catch (e) { console.warn('file d\'attente', e); if (isNetworkError(e)) break; }
      }
      if (done) toast(`${done} saisie${done > 1 ? 's' : ''} synchronisée${done > 1 ? 's' : ''}`);
      return done;
    })();
    try { return await this.flushing; } finally { this.flushing = null; }
  },
};
const isNetworkError = (e) => !navigator.onLine || /fetch|network|Failed to fetch|Load failed/i.test(String(e?.message || e));
window.addEventListener('online', () => { state.offline = false; if (state.user) { state.loaded = false; onSession({ user: state.user }); } });
window.addEventListener('offline', () => { state.offline = true; if (state.user) render(); });

const SW = {
  reg: null,
  async register() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    try {
      this.reg = await navigator.serviceWorker.register('sw.js');
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'refreshed') location.reload(); });
    } catch (e) { console.warn('service worker', e); }
  },
  // Demande au service worker de recharger le cache de l'app ; vrai si la page sera rechargée par lui.
  refresh() {
    if (!navigator.serviceWorker?.controller) return false;
    navigator.serviceWorker.controller.postMessage({ type: 'refresh' });
    setTimeout(() => location.reload(), 8000);
    return true;
  },
};
SW.register();

const Updater = {
  pending: null,
  async check() {
    try {
      const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (version && version !== APP_VERSION) this.apply(version);
    } catch { /* hors ligne : on réessaiera plus tard */ }
  },
  apply(version) {
    // Évite une boucle si le cache sert encore l'ancienne page après un rechargement.
    if (store.get('updateTried', null) === version) return this.banner(version);
    // Ne pas interrompre une saisie en cours (éditeur, feuille ouverte, scanner, mode cuisine).
    if (sheets.length || Scanner.el || $('.cook')) { this.pending = version; return this.banner(version); }
    this.reload(version);
  },
  reload(version) {
    store.set('updateTried', version);
    if (SW.refresh()) return;
    location.replace(`${location.pathname}?v=${encodeURIComponent(version)}`);
  },
  banner(version) {
    if ($('#update-banner')) return;
    const el = document.createElement('div');
    el.id = 'update-banner';
    el.className = 'toast show';
    el.style.cssText = 'pointer-events:auto;display:flex;gap:10px;align-items:center';
    el.innerHTML = '<span>Nouvelle version disponible</span><button class="btn small primary">Mettre à jour</button>';
    $('button', el).addEventListener('click', () => this.reload(version));
    document.body.append(el);
  },
};
(function afterUpdate() {
  const v = new URLSearchParams(location.search).get('v');
  if (!v) return;
  history.replaceState(null, '', location.pathname);
  if (v === APP_VERSION) { store.set('updateTried', null); setTimeout(() => toast('Application mise à jour'), 600); }
})();
Updater.check();
setInterval(() => Updater.check(), 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Updater.check(); });
