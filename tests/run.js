#!/usr/bin/env node
// Lanceur des tests : `node tests/run.js [--unit] [--e2e] [--seed] [--grep mot] [--headed]`.
// Sans option : tests unitaires puis scénarios de bout en bout. Serveur statique local + Chrome (playwright-core).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const H = require('./helpers');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const grep = args.includes('--grep') ? args[args.indexOf('--grep') + 1] : null;
const onlyUnit = has('--unit');
const onlyE2e = has('--e2e') || has('--seed');
const OUT = path.join(__dirname, '.out');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };
function serve(root, port) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    srv.on('error', (e) => { if (e.code === 'EADDRINUSE') { console.log(`Port ${port} déjà utilisé : on suppose qu'un serveur y sert le projet.`); resolve(null); } else throw e; });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

function runUnit() {
  console.log('\n== Tests unitaires ==');
  const r = spawnSync(process.execPath, ['--test', ...(grep ? ['--test-name-pattern', grep] : []), path.join(__dirname, 'unit')], { stdio: 'inherit' });
  return r.status === 0;
}

async function runE2e(env) {
  let chromium;
  try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT_CORE || '/Users/toutoune/Downloads/atelier/node_modules/playwright-core')); }
  const { devices } = require('playwright-core');
  const url = new URL(env.BASE_URL);
  const srv = url.hostname === '127.0.0.1' ? await serve(H.ROOT, Number(url.port || 80)) : null;
  const browser = await chromium.launch({ executablePath: env.CHROME_PATH, headless: !has('--headed') });
  const specs = has('--seed') ? [] : fs.readdirSync(path.join(__dirname, 'e2e')).filter((f) => f.endsWith('.spec.js')).sort();
  const results = [];
  let storageState = null; // session Supabase mémorisée après la première connexion
  const newPage = async (spec = {}) => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], ...(spec.viewport ? { viewport: spec.viewport } : {}), locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(storageState && !spec.noLogin ? { storageState } : {}) });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
    await H.installBridge(page);
    await H.setupRoutes(page, spec.routes || {});
    if (spec.clock !== false) await page.clock.setFixedTime(new Date(spec.clock || H.FIXED_TIME));
    return { ctx, page, errors };
  };
  try {
    // Données de départ (idempotent), avant tout scénario.
    {
      const { ctx, page } = await newPage({ clock: false });
      await H.login(page, env);
      const seeded = await H.ensureSeed(page);
      if (Object.keys(seeded).length) console.log('Données de départ créées :', Object.keys(seeded).join(', '));
      storageState = await ctx.storageState();
      await ctx.close();
      if (has('--seed')) return true;
    }
    console.log('\n== Scénarios de bout en bout ==');
    for (const file of specs) {
      const spec = require(path.join(__dirname, 'e2e', file));
      const tests = spec.tests.filter((t) => !grep || t.name.includes(grep) || spec.name.includes(grep));
      if (!tests.length) continue;
      console.log(`\n▶ ${spec.name}`);
      const { ctx, page, errors } = await newPage(spec);
      const t0 = Date.now();
      try {
        if (!spec.noLogin) { await H.login(page, env); await H.resetWeek(page); }
        else await page.goto(env.BASE_URL, { waitUntil: 'networkidle' });
        if (spec.before) await spec.before({ page, env, errors });
        for (const t of tests) {
          const start = Date.now();
          try {
            await t.fn({ page, env, errors, ctx });
            results.push({ spec: spec.name, name: t.name, ok: true });
            console.log(`  ✓ ${t.name} (${((Date.now() - start) / 1000).toFixed(1)} s)`);
          } catch (e) {
            const shot = path.join(OUT, `${file.replace('.spec.js', '')}-${tests.indexOf(t) + 1}.png`);
            await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
            results.push({ spec: spec.name, name: t.name, ok: false, error: e.message, shot });
            console.log(`  ✗ ${t.name}\n    ${String(e.message).split('\n').filter(Boolean).slice(0, 8).join('\n    ')}\n    capture : ${shot}`);
            await H.closeSheets(page).catch(() => {});
          }
        }
        if (spec.after) await spec.after({ page, env, errors });
        if (spec.checkErrors !== false && errors.length) {
          results.push({ spec: spec.name, name: 'aucune erreur JS', ok: false, error: errors.join('\n') });
          console.log(`  ✗ aucune erreur JS\n    ${errors.join('\n    ')}`);
        } else results.push({ spec: spec.name, name: 'aucune erreur JS', ok: true });
      } catch (e) {
        results.push({ spec: spec.name, name: '(préparation)', ok: false, error: e.message });
        console.log(`  ✗ préparation du scénario : ${e.message}`);
      } finally {
        await ctx.close();
        console.log(`  — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      }
    }
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
  const ko = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ko.length}/${results.length} vérifications réussies${ko.length ? ` · ${ko.length} échec${ko.length > 1 ? 's' : ''}` : ''}`);
  for (const r of ko) console.log(`  ✗ ${r.spec} › ${r.name}`);
  return !ko.length;
}

(async () => {
  const env = H.loadEnv();
  let ok = true;
  if (!onlyE2e) ok = runUnit() && ok;
  if (!onlyUnit) ok = (await runE2e(env)) && ok;
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
