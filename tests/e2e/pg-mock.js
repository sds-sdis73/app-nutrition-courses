// Faux PostgREST en mémoire pour les tables pas encore créées en production (une migration à coller plus tard).
// Seules les tables listées sont interceptées ; tout le reste part vers le vrai Supabase.
//
//   const { installPgMock } = require('./pg-mock');
//   const db = await installPgMock(page, {
//     tables: ['agenda_evenements', 'agenda_membres'],      // tables simulées
//     keys: { agenda_membres: ['evenement_id', 'member_id'] }, // clé d'upsert par défaut (sinon 'id')
//     seed: { agenda_evenements: [{ id: 'e1', titre: 'Judo' }] }, // lignes de départ
//     defaults: (table, row) => ({ user_id: 'moi' }),      // colonnes remplies « par le serveur »
//   });
//   db.agenda_evenements → tableau des lignes, modifiable depuis le test.
//
// Filtres compris : eq, neq, gt, gte, lt, lte, is (null, true, false), in.(a,b), like, ilike, not.<op>, or=(…) simple ;
// order=col.asc|desc (plusieurs colonnes), limit, offset, select (colonnes ignorées : la ligne entière est rendue),
// en-tête Accept « vnd.pgrst.object » (single / maybeSingle), Prefer count=exact (en-tête content-range), HEAD.
// Pour savoir si une table existe déjà en production : await realTableExists(page, 'agenda_evenements').
const RESERVES = ['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'];

function cmp(x, op, val) {
  if (op === 'is') { if (val === 'null') return x == null; if (val === 'true') return x === true || x === 'true'; if (val === 'false') return x === false || x === 'false'; return false; }
  const s = x == null ? null : (typeof x === 'object' ? JSON.stringify(x) : String(x));
  const num = (a) => (a !== null && a !== '' && !Number.isNaN(Number(a)) ? Number(a) : a);
  const [a, b] = [num(s), num(val)];
  switch (op) {
    case 'eq': return s === val || (s != null && a === b);
    case 'neq': return !(s === val || (s != null && a === b));
    case 'gt': return s != null && a > b;
    case 'gte': return s != null && a >= b;
    case 'lt': return s != null && a < b;
    case 'lte': return s != null && a <= b;
    case 'in': return val.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, '')).includes(s);
    case 'like': case 'ilike': {
      const re = new RegExp(`^${val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*')}$`, op === 'ilike' ? 'i' : '');
      return s != null && re.test(s);
    }
    case 'cs': { const arr = Array.isArray(x) ? x : []; return val.replace(/^\{|\}$/g, '').split(',').filter(Boolean).every((v) => arr.map(String).includes(v.replace(/^"|"$/g, ''))); }
    default: return true;
  }
}
function cond(row, col, expr) {
  let neg = false;
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const i = expr.indexOf('.');
  const ok = cmp(row[col], expr.slice(0, i), decodeURIComponent(expr.slice(i + 1)));
  return neg ? !ok : ok;
}
function match(row, params) {
  for (const [k, v] of params) {
    if (RESERVES.includes(k)) continue;
    if (k === 'or') {
      const parts = v.replace(/^\(|\)$/g, '').split(/,(?![^(]*\))/);
      if (!parts.some((p) => { const j = p.indexOf('.'); return cond(row, p.slice(0, j), p.slice(j + 1)); })) return false;
      continue;
    }
    if (!cond(row, k, v)) return false;
  }
  return true;
}
function trier(list, order) {
  const cles = order.split(',').map((o) => { const [col, dir, nulls] = o.split('.'); return { col, desc: dir === 'desc', nullsFirst: nulls === 'nullsfirst' }; });
  return [...list].sort((a, b) => {
    for (const { col, desc, nullsFirst } of cles) {
      const x = a[col], y = b[col];
      if (x == null && y == null) continue;
      if (x == null) return nullsFirst ? -1 : 1;
      if (y == null) return nullsFirst ? 1 : -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      if (c) return desc ? -c : c;
    }
    return 0;
  });
}

async function installPgMock(page, { tables, keys = {}, seed = {}, defaults = null } = {}) {
  if (!tables?.length) throw new Error('installPgMock : liste de tables vide');
  const db = Object.fromEntries(tables.map((t) => [t, (seed[t] || []).map((r) => ({ ...r }))]));
  let n = 0;
  await page.route((url) => url.pathname.startsWith('/rest/v1/') && tables.includes(url.pathname.split('/').pop()), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const table = u.pathname.split('/').pop();
    const params = [...u.searchParams.entries()];
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': 'content-range' };
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers });
    const h = req.headers();
    const single = /vnd\.pgrst\.object/.test(h.accept || '');
    const reply = (list, total = list.length) => {
      const hh = { ...headers, 'content-range': `${list.length ? `0-${list.length - 1}` : '*'}/${total}` };
      if (method === 'HEAD') return route.fulfill({ status: 200, headers: hh });
      if (single) {
        if (list.length !== 1) return route.fulfill({ status: 406, headers: hh, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: `${list.length} lignes`, details: null, hint: null }) });
        return route.fulfill({ status: 200, headers: hh, contentType: 'application/json', body: JSON.stringify(list[0]) });
      }
      return route.fulfill({ status: 200, headers: hh, contentType: 'application/json', body: JSON.stringify(list) });
    };
    if (method === 'GET' || method === 'HEAD') {
      let list = db[table].filter((r) => match(r, params));
      const total = list.length;
      if (u.searchParams.get('order')) list = trier(list, u.searchParams.get('order'));
      const off = Number(u.searchParams.get('offset') || 0);
      const lim = u.searchParams.has('limit') ? Number(u.searchParams.get('limit')) : Infinity;
      return reply(list.slice(off, off + lim), total);
    }
    if (method === 'POST') {
      const body = JSON.parse(req.postData() || '[]');
      const conflict = (u.searchParams.get('on_conflict') || (keys[table] || ['id']).join(',')).split(',');
      const out = [];
      // Insertion ou upsert : une ligne de même clé est fusionnée (comme un upsert).
      for (const r of Array.isArray(body) ? body : [body]) {
        const row = { id: r.id || `mock-${++n}`, created_at: new Date().toISOString(), ...(defaults ? defaults(table, r) : {}), ...r };
        const i = db[table].findIndex((x) => conflict.every((c) => String(x[c]) === String(row[c])));
        if (i >= 0) db[table][i] = { ...db[table][i], ...row }; else db[table].push(row);
        out.push(i >= 0 ? db[table][i] : row);
      }
      return reply(out);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(req.postData() || '{}');
      const list = db[table].filter((r) => match(r, params));
      for (const r of list) Object.assign(r, patch);
      return reply(list);
    }
    if (method === 'DELETE') {
      const gone = db[table].filter((r) => match(r, params));
      db[table] = db[table].filter((r) => !match(r, params));
      return reply(gone);
    }
    return route.fulfill({ status: 405, headers });
  });
  return db;
}

// Vrai si la table existe déjà dans le vrai Supabase (migration appliquée) : le scénario peut alors s'en servir.
async function realTableExists(page, table) {
  return page.evaluate(async (t) => { const { error } = await db.from(t).select('*').limit(1); return !error; }, table);
}

module.exports = { installPgMock, realTableExists, match };
