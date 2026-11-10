// Tables du module Forme simulées (mini PostgREST en mémoire) tant que la migration n'est pas appliquée en production.
// Si les tables existent déjà, rien n'est intercepté : le scénario tourne contre le vrai Supabase.
const TABLES = ['forme_profil', 'forme_lieux', 'forme_exercices', 'forme_objectifs', 'forme_semaines', 'forme_seances', 'mensurations'];
const KEYS = { forme_profil: ['member_id'] };

function match(row, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict', 'columns', 'offset'].includes(k)) continue;
    const i = v.indexOf('.');
    const op = v.slice(0, i), val = decodeURIComponent(v.slice(i + 1));
    const x = row[k] == null ? null : String(row[k]);
    if (op === 'eq' && x !== val) return false;
    if (op === 'neq' && x === val) return false;
    if (op === 'gte' && !(x != null && x >= val)) return false;
    if (op === 'lte' && !(x != null && x <= val)) return false;
    if (op === 'is' && val === 'null' && x != null) return false;
  }
  return true;
}

async function installFormeMock(page) {
  const db = Object.fromEntries(TABLES.map((t) => [t, []]));
  let n = 0;
  await page.route((url) => /\/rest\/v1\/(forme_[a-z]+|mensurations)$/.test(url.pathname), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const table = u.pathname.split('/').pop();
    const params = [...u.searchParams.entries()];
    const rows = db[table];
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': 'content-range' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers });
    const single = /vnd\.pgrst\.object/.test(req.headers().accept || '');
    const reply = (list) => {
      if (single) return list.length ? route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(list[0]) }) : route.fulfill({ status: 406, headers, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }) });
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(list) });
    };
    if (req.method() === 'GET') {
      let list = rows.filter((r) => match(r, params));
      const order = u.searchParams.get('order');
      if (order) { const [col, dir] = order.split('.'); list = [...list].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1)); }
      return reply(list);
    }
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '[]');
      const conflict = (u.searchParams.get('on_conflict') || (KEYS[table] || ['id']).join(',')).split(',');
      const out = [];
      for (const r of Array.isArray(body) ? body : [body]) {
        const row = { id: r.id || `mock-${++n}`, created_at: new Date().toISOString(), ...r };
        const i = rows.findIndex((x) => conflict.every((c) => String(x[c]) === String(row[c])));
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push(row);
        out.push(i >= 0 ? rows[i] : row);
      }
      return reply(out);
    }
    if (req.method() === 'PATCH') {
      const patch = JSON.parse(req.postData() || '{}');
      const list = rows.filter((r) => match(r, params));
      for (const r of list) Object.assign(r, patch);
      return reply(list);
    }
    if (req.method() === 'DELETE') {
      const keep = rows.filter((r) => !match(r, params));
      const gone = rows.length - keep.length;
      db[table] = keep;
      return route.fulfill({ status: 204, headers: { ...headers, 'content-range': `*/${gone}` } });
    }
    return route.fulfill({ status: 405, headers });
  });
  return db;
}
module.exports = { installFormeMock, TABLES };
