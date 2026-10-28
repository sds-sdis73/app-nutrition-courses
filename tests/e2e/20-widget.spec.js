// Le script du widget est exécuté dans Node avec un faux Scriptable (Request, Keychain, ListWidget…) branché sur le vrai Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'widget', 'miam-et-moi.js'), 'utf8');

function scriptable({ email, password, action = null, family = 'medium' }) {
  const keychain = new Map([['miam.email', email], ['miam.password', password]]);
  const texts = [];
  const urls = [];
  const notifications = [];
  let widget = null;
  const node = () => {
    const n = { children: [], addText(t) { texts.push(t); const x = { text: t }; return x; }, addStack() { const s = node(); return s; }, addSpacer() {}, addImage() { return {}; }, layoutVertically() {}, centerAlignContent() {}, setPadding() {} };
    return new Proxy(n, { set(o, k, v) { if (k === 'url') urls.push(v); o[k] = v; return true; } });
  };
  class Request {
    constructor(url) { this.url = url; this.method = 'GET'; this.headers = {}; }
    async loadString() {
      const r = await fetch(this.url, { method: this.method, headers: this.headers, body: this.body });
      this.response = { statusCode: r.status };
      return r.text();
    }
  }
  class DrawContext { addPath() {} setFillColor() {} fillPath() {} getImage() { return {}; } }
  class Path { addRoundedRect() {} }
  class ListWidget { constructor() { widget = node(); return widget; } }
  class Notification { async schedule() { notifications.push(this.body); } }
  const sandbox = {
    console, fetch, Request, DrawContext, Path, ListWidget, Notification,
    Rect: class {}, Size: class {}, Color: class { static white() { return {}; } },
    Font: { semiboldSystemFont: () => ({}), boldSystemFont: () => ({}), systemFont: () => ({}), mediumSystemFont: () => ({}) },
    Keychain: { contains: (k) => keychain.has(k), get: (k) => keychain.get(k), set: (k, v) => keychain.set(k, v), remove: (k) => keychain.delete(k) },
    Alert: class { addTextField() {} addSecureTextField() {} addAction() {} addCancelAction() {} async present() { return 0; } textFieldValue() { return ''; } },
    config: { runsInWidget: true, runsInApp: false, widgetFamily: family },
    args: { queryParameters: action ? { action } : {} },
    Script: { setWidget: () => {}, complete: () => {}, name: () => 'Miam & moi' },
  };
  vm.createContext(sandbox);
  const run = () => vm.runInContext(`(async () => {\n${SRC}\n})()`, sandbox);
  return { run, texts, urls, notifications, keychain };
}

module.exports = {
  name: 'Widget iPhone (Scriptable simulé, vrai Supabase)',
  noLogin: true,
  clock: false,
  checkErrors: false,
  tests: [
    { name: 'connexion, puis affichage du compagnon, de l\'eau et des boutons', fn: async ({ env }) => {
      const w = scriptable({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD });
      await w.run();
      assert.ok(w.keychain.has('miam.refresh'), 'jeton de rafraîchissement gardé');
      assert.ok(w.texts.some((t) => /^Eau$/.test(t)), w.texts.join(' | '));
      assert.ok(w.texts.some((t) => /🍽️ Noter/.test(t)));
      assert.ok(w.urls.some((u) => /\?action=noter$/.test(u)));
      assert.ok(w.urls.some((u) => /^scriptable:\/\/\/run\/Miam%20%26%20moi\?action=eau$/.test(u)));
      assert.ok(!w.texts.some((t) => /Erreur|annulée|sans foyer/.test(t)), w.texts.join(' | '));
    } },
    { name: 'bouton +250 ml : eau enregistrée sans ouvrir l\'application, notification affichée', fn: async ({ env }) => {
      const KEY = SRC.match(/SUPABASE_KEY = '([^']+)'/)[1];
      const URL0 = SRC.match(/SUPABASE_URL = '([^']+)'/)[1];
      const w = scriptable({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD, action: 'eau' });
      await w.run();
      assert.equal(w.notifications.length, 1);
      assert.match(w.notifications[0], /\+250 ml d'eau pour /);
      // Vérification et nettoyage directement dans la base (date du jour réelle).
      const tok = await (await fetch(`${URL0}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: w.keychain.get('miam.refresh') }) })).json();
      const h = { apikey: KEY, Authorization: `Bearer ${tok.access_token}` };
      const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const rows = await (await fetch(`${URL0}/rest/v1/hydratation?select=id,ml&date=eq.${day}`, { headers: h })).json();
      assert.ok(rows.some((r) => r.ml === 250), JSON.stringify(rows));
      await fetch(`${URL0}/rest/v1/hydratation?date=eq.${day}`, { method: 'DELETE', headers: h });
    } },
  ],
};
