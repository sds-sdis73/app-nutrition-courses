// Miam & moi — widget d'écran d'accueil pour Scriptable (iPhone).
// Installation : voir Paramètres › Widget iPhone dans l'application.
// Affiche le compagnon, les calories, l'eau et l'activité du jour ; « +250 ml » s'enregistre sans ouvrir l'application.

const SUPABASE_URL = 'https://svugddkrptqpjmywhorb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dWdkZGtycHRxcGpteXdob3JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MjU5NDgsImV4cCI6MjEwODUwMTk0OH0.63RETgf7rbVMquGV-7ooY3qn-Qf31uVCA3ZBfqBvFcI';
const APP_URL = 'https://sds-sdis73.github.io/app-nutrition-courses/';
const K = { email: 'miam.email', password: 'miam.password', refresh: 'miam.refresh' };
const COLORS = { bg: '#fff3d1', ink: '#27233a', muted: '#6e6680', fraise: '#dc3a3a', mangue: '#ffb703', ciel: '#3aa6ff', menthe: '#06d6a0', piste: '#ffe7c7' };
const ANIMAUX = { loutre: '🦦', herisson: '🦔', renard: '🦊' };

const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtL = (ml) => (ml >= 1000 ? `${(Math.round(ml / 100) / 10).toString().replace('.', ',')} L` : `${ml} ml`);

async function call(path, { method = 'GET', token, body, prefer } = {}) {
  const r = new Request(`${SUPABASE_URL}${path}`);
  r.method = method;
  r.headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(prefer ? { Prefer: prefer } : {}) };
  if (body) r.body = JSON.stringify(body);
  const data = await r.loadString();
  const status = r.response?.statusCode ?? 0;
  let json = null;
  try { json = data ? JSON.parse(data) : null; } catch { /* réponse vide */ }
  if (status >= 400) throw new Error(json?.error_description || json?.msg || json?.message || `Erreur ${status}`);
  return json;
}

// Connexion : jeton de rafraîchissement gardé dans le trousseau ; e-mail et mot de passe demandés au premier lancement.
async function askCredentials() {
  const a = new Alert();
  a.title = 'Miam & moi';
  a.message = 'Saisis ton e-mail et ton mot de passe Miam & moi. Ils restent dans le trousseau de cet iPhone.';
  a.addTextField('E-mail', Keychain.contains(K.email) ? Keychain.get(K.email) : '');
  a.addSecureTextField('Mot de passe', '');
  a.addAction('Se connecter');
  a.addCancelAction('Annuler');
  if ((await a.present()) === -1) throw new Error('Connexion annulée');
  Keychain.set(K.email, a.textFieldValue(0).trim().toLowerCase());
  Keychain.set(K.password, a.textFieldValue(1));
}
async function session() {
  if (Keychain.contains(K.refresh)) {
    try {
      const s = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: Keychain.get(K.refresh) } });
      Keychain.set(K.refresh, s.refresh_token);
      return s;
    } catch { Keychain.remove(K.refresh); }
  }
  if (!Keychain.contains(K.email) || !Keychain.contains(K.password)) {
    if (!config.runsInApp) throw new Error('Ouvre Scriptable et lance le script une fois pour te connecter.');
    await askCredentials();
  }
  const s = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: Keychain.get(K.email), password: Keychain.get(K.password) } });
  Keychain.set(K.refresh, s.refresh_token);
  return s;
}

async function load(s) {
  const token = s.access_token;
  const [compte] = await call(`/rest/v1/foyer_comptes?select=member_id,foyer_id&user_id=eq.${s.user.id}`, { token });
  if (!compte) throw new Error('Compte sans foyer : ouvre Miam & moi une première fois.');
  const membres = await call(`/rest/v1/foyer_membres?select=id,nom&foyer_id=eq.${compte.foyer_id}&order=ordre`, { token });
  const membre = membres.find((m) => m.id === compte.member_id) || membres[0];
  if (!membre) throw new Error('Ajoute les membres du foyer dans Miam & moi.');
  const d = today();
  const eau = await call(`/rest/v1/hydratation?select=ml&member_id=eq.${membre.id}&date=eq.${d}`, { token });
  let resume = null;
  try { [resume] = await call(`/rest/v1/resume_jour?select=data&member_id=eq.${membre.id}&date=eq.${d}`, { token }); } catch { /* table absente */ }
  return { token, membre, eauMl: eau.reduce((t, x) => t + x.ml, 0), r: resume?.data || null };
}

async function addWater(ml) {
  const s = await session();
  const { token, membre } = await load(s);
  await call('/rest/v1/hydratation', { method: 'POST', token, prefer: 'return=minimal', body: { member_id: membre.id, date: today(), heure: nowHM(), ml } });
  const n = new Notification();
  n.title = 'Miam & moi';
  n.body = `+${ml} ml d'eau pour ${membre.nom} 💧`;
  await n.schedule();
}

// Barre de progression dessinée (image).
function barImage(value, max, color, w = 150, h = 10) {
  const c = new DrawContext();
  c.size = new Size(w, h); c.opaque = false; c.respectScreenScale = true;
  const track = new Path(); track.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2);
  c.addPath(track); c.setFillColor(new Color(COLORS.piste)); c.fillPath();
  const pct = max ? Math.max(0, Math.min(1, value / max)) : 0;
  if (pct > 0) { const p = new Path(); p.addRoundedRect(new Rect(0, 0, Math.max(h, w * pct), h), h / 2, h / 2); c.addPath(p); c.setFillColor(new Color(color)); c.fillPath(); }
  return c.getImage();
}
function line(stack, label, txt, value, max, color) {
  const row = stack.addStack(); row.layoutVertically();
  const t = row.addStack();
  const a = t.addText(label); a.font = Font.semiboldSystemFont(11); a.textColor = new Color(COLORS.muted);
  t.addSpacer();
  const b = t.addText(txt); b.font = Font.boldSystemFont(11); b.textColor = new Color(COLORS.ink);
  row.addSpacer(3);
  const img = row.addImage(barImage(value, max, color)); img.imageSize = new Size(150, 8);
  stack.addSpacer(6);
}
function button(stack, txt, url, bg) {
  const b = stack.addStack();
  b.backgroundColor = new Color(bg); b.cornerRadius = 10; b.setPadding(5, 8, 5, 8); b.url = url;
  const t = b.addText(txt); t.font = Font.boldSystemFont(12); t.textColor = Color.white(); t.lineLimit = 1;
}

function build(data, error) {
  const w = new ListWidget();
  w.backgroundColor = new Color(COLORS.bg);
  w.setPadding(12, 14, 10, 14);
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 20 * 60 * 1000);
  if (error) {
    const t = w.addText('Miam & moi'); t.font = Font.boldSystemFont(15); t.textColor = new Color(COLORS.fraise);
    w.addSpacer(4);
    const e = w.addText(error); e.font = Font.systemFont(12); e.textColor = new Color(COLORS.ink);
    return w;
  }
  const { membre, eauMl, r } = data;
  const c = r?.compagnon;
  const small = config.widgetFamily === 'small';
  const top = w.addStack(); top.centerAlignContent();
  const face = top.addText(c ? ANIMAUX[c.espece] || '🦦' : '🍽️'); face.font = Font.systemFont(small ? 30 : 36);
  top.addSpacer(8);
  const id = top.addStack(); id.layoutVertically();
  const n = id.addText(c ? c.nom : membre.nom); n.font = Font.boldSystemFont(14); n.textColor = new Color(COLORS.ink);
  const sub = id.addText(c ? `${c.coquillages} 🐚 · 🔥 ${c.serie} j` : 'Miam & moi'); sub.font = Font.semiboldSystemFont(11); sub.textColor = new Color(COLORS.muted);
  if (!small && c?.message) {
    top.addSpacer(8);
    const bub = top.addStack(); bub.backgroundColor = Color.white(); bub.cornerRadius = 10; bub.setPadding(4, 8, 4, 8); bub.size = new Size(150, 0);
    const m = bub.addText(c.message); m.font = Font.mediumSystemFont(10); m.textColor = new Color(COLORS.ink); m.lineLimit = 2;
  }
  w.addSpacer(8);
  const body = w.addStack(); body.layoutVertically();
  const eauObj = r?.eauObj || 2000;
  if (r) line(body, 'Mangé', `${r.kcal} / ${r.besoin} kcal`, r.kcal, r.besoin, COLORS.fraise);
  line(body, 'Eau', `${fmtL(eauMl)} / ${fmtL(eauObj)}`, eauMl, eauObj, COLORS.ciel);
  if (r && !small) line(body, 'Activité', `${r.actif} / ${r.actifObj} kcal`, r.actif, r.actifObj, COLORS.mangue);
  if (!r) { const h = body.addText("Ouvre Miam & moi aujourd'hui pour les calories."); h.font = Font.systemFont(10); h.textColor = new Color(COLORS.muted); }
  if (!small) {
    w.addSpacer();
    const row = w.addStack(); row.centerAlignContent();
    button(row, '🍽️ Noter', `${APP_URL}?action=noter`, COLORS.fraise);
    row.addSpacer(6);
    button(row, '💧 +250 ml', `scriptable:///run/${encodeURIComponent(Script.name())}?action=eau`, COLORS.ciel);
    row.addSpacer(6);
    button(row, '🏃', `${APP_URL}?action=activite`, COLORS.mangue);
    if (r?.prochain) { row.addSpacer(); const p = row.addText(r.prochain); p.font = Font.systemFont(9); p.textColor = new Color(COLORS.muted); p.lineLimit = 1; p.minimumScaleFactor = 0.7; }
  }
  return w;
}

async function main() {
  const action = args.queryParameters?.action;
  if (action === 'eau') {
    try { await addWater(250); } catch (e) { const a = new Alert(); a.title = 'Miam & moi'; a.message = e.message; a.addAction('OK'); await a.present(); }
    Script.complete();
    return;
  }
  let w;
  try { const s = await session(); w = build(await load(s)); } catch (e) { w = build(null, e.message); }
  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentMedium();
  Script.complete();
}
await main();
