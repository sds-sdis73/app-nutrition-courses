import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Synchronise la dépense (pas, calories) depuis Polar, Withings, Oura et Strava pour les connexions enregistrées.
// Appelée toutes les heures (pg_cron) ou à la demande ({ member_id }) ; lit hier et aujourd'hui.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const iso = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const creds = (p: string) => ({ id: Deno.env.get(`${p.toUpperCase()}_CLIENT_ID`) ?? "", secret: Deno.env.get(`${p.toUpperCase()}_CLIENT_SECRET`) ?? "" });

type Cx = { id: string; foyer_id: string; member_id: string; provider: string; external_id: string | null; access_token: string; refresh_token: string | null; expires_at: string | null };
type Row = { date: string; source: string; kind: "journee" | "seance"; ref: string; label: string; kcal: number | null; kcal_total: number | null; steps: number | null; minutes: number | null; distance_m: number | null; raw: unknown };

async function refresh(cx: Cx, admin: ReturnType<typeof createClient>): Promise<string> {
  if (!cx.expires_at || !cx.refresh_token || new Date(cx.expires_at).getTime() - Date.now() > 5 * 60 * 1000) return cx.access_token;
  const { id, secret } = creds(cx.provider);
  let tok: Record<string, unknown> = {};
  if (cx.provider === "withings") {
    const r = await fetch("https://wbsapi.withings.net/v2/oauth2", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "requesttoken", grant_type: "refresh_token", client_id: id, client_secret: secret, refresh_token: cx.refresh_token }) });
    const j = await r.json();
    if (j.status !== 0) throw new Error(`refresh ${JSON.stringify(j)}`);
    tok = j.body;
  } else {
    const endpoint = cx.provider === "oura" ? "https://api.ouraring.com/oauth/token" : "https://www.strava.com/oauth/token";
    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cx.refresh_token, client_id: id, client_secret: secret }) });
    tok = await r.json();
    if (!r.ok) throw new Error(`refresh ${JSON.stringify(tok)}`);
  }
  const expiresAt = tok.expires_at ? new Date(Number(tok.expires_at) * 1000) : new Date(Date.now() + Number(tok.expires_in ?? 3600) * 1000);
  await admin.from("connexions_montres").update({ access_token: String(tok.access_token), refresh_token: tok.refresh_token ? String(tok.refresh_token) : cx.refresh_token, expires_at: expiresAt.toISOString() }).eq("id", cx.id);
  return String(tok.access_token);
}

const parseDuration = (iso8601: string) => { const m = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/); return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0; };

async function fetchPolar(cx: Cx, token: string): Promise<Row[]> {
  const base = `https://www.polaraccesslink.com/v3/users/${cx.external_id}/activity-transactions`;
  const h = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const t = await fetch(base, { method: "POST", headers: h });
  if (t.status === 204) return [];
  if (!t.ok) throw new Error(`polar ${t.status}`);
  const { "transaction-id": tid } = await t.json();
  const list = await (await fetch(`${base}/${tid}`, { headers: h })).json();
  const rows: Row[] = [];
  for (const u of list["activity-log"] ?? []) {
    const a = await (await fetch(u, { headers: h })).json();
    rows.push({ date: a.date, source: "polar", kind: "journee", ref: "", label: "Journée (Polar)", kcal: a["active-calories"] ?? null, kcal_total: a.calories ?? null, steps: a["active-steps"] ?? null, minutes: a.duration ? Math.round(parseDuration(a.duration) / 60) : null, distance_m: null, raw: a });
  }
  await fetch(`${base}/${tid}`, { method: "PUT", headers: h });
  return rows;
}
async function fetchWithings(token: string, from: string, to: string): Promise<Row[]> {
  const r = await fetch("https://wbsapi.withings.net/v2/measure", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "getactivity", startdateymd: from, enddateymd: to, data_fields: "steps,distance,calories,totalcalories,active,moderate,intense" }) });
  const j = await r.json();
  if (j.status !== 0) throw new Error(`withings ${JSON.stringify(j)}`);
  return (j.body?.activities ?? []).map((a: Record<string, number | string>) => ({ date: String(a.date), source: "withings", kind: "journee" as const, ref: "", label: "Journée (Withings)", kcal: a.calories != null ? Math.round(Number(a.calories)) : null, kcal_total: a.totalcalories != null ? Math.round(Number(a.totalcalories)) : null, steps: a.steps != null ? Number(a.steps) : null, minutes: Math.round((Number(a.active ?? 0) + Number(a.moderate ?? 0) + Number(a.intense ?? 0)) / 60) || null, distance_m: a.distance != null ? Math.round(Number(a.distance)) : null, raw: a }));
}
async function fetchOura(token: string, from: string, to: string): Promise<Row[]> {
  const r = await fetch(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${from}&end_date=${to}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`oura ${r.status}`);
  const j = await r.json();
  return (j.data ?? []).map((a: Record<string, number | string>) => ({ date: String(a.day), source: "oura", kind: "journee" as const, ref: "", label: "Journée (Oura)", kcal: a.active_calories != null ? Number(a.active_calories) : null, kcal_total: a.total_calories != null ? Number(a.total_calories) : null, steps: a.steps != null ? Number(a.steps) : null, minutes: a.high_activity_time != null ? Math.round((Number(a.high_activity_time) + Number(a.medium_activity_time ?? 0)) / 60) : null, distance_m: a.equivalent_walking_distance != null ? Math.round(Number(a.equivalent_walking_distance)) : null, raw: a }));
}
async function fetchStrava(token: string, fromTs: number): Promise<Row[]> {
  const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${fromTs}&per_page=30`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`strava ${r.status}`);
  const list = await r.json();
  const rows: Row[] = [];
  for (const a of list.slice(0, 15)) {
    const d = await (await fetch(`https://www.strava.com/api/v3/activities/${a.id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    rows.push({ date: String(d.start_date_local ?? a.start_date_local).slice(0, 10), source: "strava", kind: "seance", ref: String(a.id), label: d.name ?? a.name ?? a.sport_type, kcal: d.calories != null ? Math.round(d.calories) : d.kilojoules != null ? Math.round(d.kilojoules / 4.184) : null, kcal_total: null, steps: null, minutes: Math.round((d.moving_time ?? a.moving_time ?? 0) / 60) || null, distance_m: d.distance != null ? Math.round(d.distance) : null, raw: { id: a.id, sport_type: a.sport_type } });
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: { member_id?: string; provider?: string } = {};
  try { body = await req.json(); } catch { /* cron */ }
  let q = admin.from("connexions_montres").select("*");
  if (body.member_id) q = q.eq("member_id", body.member_id);
  if (body.provider) q = q.eq("provider", body.provider);
  const { data: list } = await q;
  const today = new Date();
  const from = iso(new Date(today.getTime() - 864e5));
  const to = iso(today);
  const results: Record<string, string> = {};
  for (const cx of (list ?? []) as Cx[]) {
    try {
      const token = await refresh(cx, admin);
      let rows: Row[] = [];
      if (cx.provider === "polar") rows = await fetchPolar(cx, token);
      if (cx.provider === "withings") rows = await fetchWithings(token, from, to);
      if (cx.provider === "oura") rows = await fetchOura(token, from, to);
      if (cx.provider === "strava") rows = await fetchStrava(token, Math.floor((Date.now() - 2 * 864e5) / 1000));
      if (rows.length) {
        const { error } = await admin.from("activites").upsert(rows.map((r) => ({ ...r, foyer_id: cx.foyer_id, member_id: cx.member_id })), { onConflict: "member_id,date,source,ref" });
        if (error) throw error;
      }
      await admin.from("connexions_montres").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", cx.id);
      results[`${cx.provider}:${cx.member_id.slice(0, 8)}`] = `${rows.length} ligne(s)`;
    } catch (e) {
      const msg = String((e as Error).message || e).slice(0, 180);
      await admin.from("connexions_montres").update({ last_error: msg }).eq("id", cx.id);
      results[`${cx.provider}:${cx.member_id.slice(0, 8)}`] = `erreur ${msg}`;
    }
  }
  return json({ ok: true, results });
});
