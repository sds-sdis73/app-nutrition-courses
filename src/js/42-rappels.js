// ---------------------------------------------------------------------------
// Rappels (Web Push)
// ---------------------------------------------------------------------------
const VAPID_PUBLIC = 'BGtcjD-H4BoUOSKDxhxrXqjtVqj6m8JHnqBbcOv3kK-BUTulfwV9ewxlZsF8oKogOEKtFFfZhehR6XtzDA8_5rw';
const PUSH_DEFAULTS = { batch: true, congel: true, courses: true, courses_day: 5, courses_hour: 9, planning: true, bilan: true, seance: true, dispos: true };
const Push = {
  supported: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  standaloneHint: () => /iPhone|iPad/.test(navigator.userAgent) && !window.navigator.standalone && !matchMedia('(display-mode: standalone)').matches,
  async current() {
    if (!this.supported()) return null;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) { state.push = null; return null; }
    const { data } = await db.from('push_abonnements').select('*').eq('endpoint', sub.endpoint).maybeSingle();
    state.push = data || null;
    return state.push;
  },
  async subscribe() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications refusées par le navigateur');
    const reg = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(VAPID_PUBLIC.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const j = sub.toJSON();
    const row = { endpoint: sub.endpoint, keys: j.keys, prefs: state.push?.prefs || PUSH_DEFAULTS, ua: navigator.userAgent.slice(0, 200), ...own() };
    const { data, error } = await db.from('push_abonnements').upsert(row, { onConflict: 'endpoint' }).select().single();
    if (error) throw error;
    state.push = data;
  },
  async unsubscribe() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await db.from('push_abonnements').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    state.push = null;
  },
  async savePrefs(prefs) {
    if (!state.push) return;
    const { error } = await db.from('push_abonnements').update({ prefs }).eq('endpoint', state.push.endpoint);
    if (error) throw error;
    state.push.prefs = prefs;
  },
};
function openRappels() {
  const el = openSheet(`${sheetHead('Rappels')}<div data-body><div class="spinner"></div></div>`);
  const draw = async () => {
    try { await Push.current(); } catch { /* indisponible */ }
    const on = !!state.push;
    const pr = { ...PUSH_DEFAULTS, ...(state.push?.prefs || {}) };
    $('[data-body]', el).innerHTML = !Push.supported()
      ? '<p class="muted">Les notifications ne sont pas disponibles dans ce navigateur.</p>'
      : `${Push.standaloneHint() ? '<p class="small warn">Sur iPhone, les rappels fonctionnent uniquement quand l\'app est installée sur l\'écran d\'accueil (Partager › Sur l\'écran d\'accueil), puis ouverte depuis son icône.</p>' : ''}
      <label class="check" style="display:flex;min-height:48px"><input type="checkbox" data-x="on" ${on ? 'checked' : ''}><span class="grow"><b>Rappels sur cet appareil</b><br><span class="muted small">Notifications même quand l'app est fermée.</span></span></label>
      ${on ? `<div class="ntable">
        <label class="check" style="display:flex;padding:6px 0"><input type="checkbox" data-p="batch" ${pr.batch ? 'checked' : ''}><span class="grow">Samedi 18 h : session batch cooking du lendemain</span></label>
        <label class="check" style="display:flex;padding:6px 0"><input type="checkbox" data-p="congel" ${pr.congel ? 'checked' : ''}><span class="grow">La veille à 19 h : sortir un reste du congélateur</span></label>
        <label class="check" style="display:flex;padding:6px 0"><input type="checkbox" data-p="planning" ${pr.planning ? 'checked' : ''}><span class="grow">Vendredi 18 h : semaine prochaine encore vide</span></label>
        <label class="check" style="display:flex;padding:6px 0"><input type="checkbox" data-p="bilan" ${pr.bilan !== false ? 'checked' : ''}><span class="grow">20 h : bilan du soir avec mon compagnon</span></label>
        <label class="check" style="display:flex;padding:6px 0"><input type="checkbox" data-p="seance" ${pr.seance !== false ? 'checked' : ''}><span class="grow">Forme : 1 h avant chaque séance prévue</span></label>
        <label class="check" style="display:flex;padding:6px 0"><input type="checkbox" data-p="dispos" ${pr.dispos !== false ? 'checked' : ''}><span class="grow">Forme : dimanche 18 h, saisir mes dispos de la semaine</span></label>
        <label class="check" style="display:flex;padding:6px 0"><input type="checkbox" data-p="courses" ${pr.courses ? 'checked' : ''}><span class="grow">Liste de courses prête</span></label>
        <div class="grid2" style="margin:4px 0 0 30px"><select class="input" data-p="courses_day">${DAYS.map((d, i) => `<option value="${i}" ${Number(pr.courses_day) === i ? 'selected' : ''}>${d}</option>`).join('')}</select>
          <select class="input" data-p="courses_hour">${[7, 8, 9, 10, 11, 12, 14, 17, 18, 19, 20].map((h) => `<option value="${h}" ${Number(pr.courses_hour) === h ? 'selected' : ''}>${h} h</option>`).join('')}</select></div>
        <button class="btn block" data-act="push-test" style="margin-top:10px">${ICON.sparkle} M'envoyer une notification de test</button></div>` : ''}`;
  };
  draw();
  el.addEventListener('change', async (e) => {
    const t = e.target;
    try {
      if (t.dataset.x === 'on') { if (t.checked) await Push.subscribe(); else await Push.unsubscribe(); toast(t.checked ? 'Rappels activés' : 'Rappels désactivés'); return draw(); }
      if (t.dataset.p) {
        const prefs = { ...PUSH_DEFAULTS, ...(state.push?.prefs || {}) };
        prefs[t.dataset.p] = t.type === 'checkbox' ? t.checked : Number(t.value);
        await Push.savePrefs(prefs);
      }
    } catch (err) { toast(err.message || 'Impossible'); draw(); }
  });
}

