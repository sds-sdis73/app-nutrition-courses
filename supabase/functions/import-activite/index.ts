import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Pont téléphone : reçoit les données d'activité du jour (pas, calories) envoyées par un Raccourci iOS,
// Tasker (plugin Health Connect), Health Auto Export ou tout script, authentifiées par un jeton d'import.
// Formats acceptés : objet simple, tableau d'objets, export Health Auto Export, agrégats Tasker.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-import-token, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Day = { date: string; steps?: number; active_kcal?: number; total_kcal?: number; resting_kcal?: number; exercise_min?: number; distance_m?: number; source?: string };

function parisToday(): string {
  const f = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date());
}
const num = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === "object") { const o = v as Record<string, unknown>; return num(o.inKilocalories ?? o.inMeters ?? o.value ?? o.qty ?? o.count ?? o.inMinutes); }
  const n = parseFloat(String(v).replace(",", "."));
  return isFinite(n) ? n : undefined;
};
const toDate = (v: unknown): string => {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) || s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return parisToday();
  return m[0].includes("/") ? `${m[3]}-${m[2]}-${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
};

// Détection souple des champs : noms anglais/français, Health Connect, Apple Santé.
function fromLoose(o: Record<string, unknown>): Day | null {
  const keys = Object.keys(o);
  const find = (re: RegExp) => keys.find((k) => re.test(k.toLowerCase().replace(/[\s_-]/g, "")));
  const g = (re: RegExp) => { const k = find(re); return k ? num(o[k]) : undefined; };
  const d: Day = {
    date: toDate(o.date ?? o.day ?? o.jour ?? o.startTime ?? o.start),
    steps: g(/^(steps?|pas|stepcount|stepsrecord|counttotal|nombredepas)$/) ?? g(/step/),
    active_kcal: g(/^(activekcal|activeenergy|activecalories|kcalactives|caloriesactives|activecaloriesburned.*|activeenergyburned)$/) ?? g(/active.*(cal|energ)/),
    total_kcal: g(/^(totalkcal|totalenergy|totalcalories|kcaltotal|caloriestotales|totalcaloriesburned.*|energytotal|tdee)$/) ?? g(/total.*(cal|energ)/),
    resting_kcal: g(/^(restingkcal|restingenergy|basalenergy|basalenergyburned|kcalrepos|bmr)$/) ?? g(/(rest|basal|repos).*(cal|energ)/),
    exercise_min: g(/^(exercisemin|exerciseminutes|appleexercisetime|minutes|minutesactives|activeminutes)$/) ?? g(/exercise|minute/),
    distance_m: g(/^(distancem|distance|distancemeters|distancewalkingrunning)$/) ?? g(/distance/),
    source: typeof o.source === "string" ? o.source : undefined,
  };
  if (d.steps == null && d.active_kcal == null && d.total_kcal == null && d.resting_kcal == null) return null;
  // Distance exprimée en km dans certains exports
  if (d.distance_m != null && d.distance_m < 500 && find(/km/)) d.distance_m = Math.round(d.distance_m * 1000);
  return d;
}

// Health Auto Export : { data: { metrics: [{ name, units, data: [{ date, qty }] }] } }
function fromHealthAutoExport(body: Record<string, unknown>): Day[] {
  const metrics = (body.data as { metrics?: { name: string; units?: string; data: { date: string; qty?: number }[] }[] })?.metrics;
  if (!Array.isArray(metrics)) return [];
  const byDate = new Map<string, Day>();
  const map: Record<string, keyof Day> = { step_count: "steps", active_energy: "active_kcal", basal_energy_burned: "resting_kcal", apple_exercise_time: "exercise_min", walking_running_distance: "distance_m" };
  for (const m of metrics) {
    const field = map[m.name];
    if (!field) continue;
    for (const pt of m.data ?? []) {
      const date = toDate(pt.date);
      const d = byDate.get(date) ?? { date, source: "health-auto-export" };
      let v = num(pt.qty) ?? 0;
      if (field === "distance_m" && /km/i.test(m.units ?? "")) v *= 1000;
      if (field === "distance_m" && /mi/i.test(m.units ?? "")) v *= 1609.34;
      if ((field === "active_kcal" || field === "resting_kcal") && /kj/i.test(m.units ?? "")) v /= 4.184;
      (d as Record<string, unknown>)[field] = ((d as Record<string, unknown>)[field] as number ?? 0) + v;
      byDate.set(date, d);
    }
  }
  return [...byDate.values()];
}

function normalize(body: unknown): Day[] {
  if (Array.isArray(body)) return body.map((x) => (x && typeof x === "object" ? fromLoose(x as Record<string, unknown>) : null)).filter(Boolean) as Day[];
  if (!body || typeof body !== "object") return [];
  const o = body as Record<string, unknown>;
  const hae = fromHealthAutoExport(o);
  if (hae.length) return hae;
  if (Array.isArray(o.days)) return normalize(o.days);
  const one = fromLoose(o);
  return one ? [one] : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") || req.headers.get("x-import-token") || "").trim();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json({ error: "Jeton manquant ou invalide" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: jeton } = await admin.from("jetons_import").select("*").eq("token", token).maybeSingle();
  if (!jeton) return json({ error: "Jeton inconnu" }, 401);

  if (req.method === "GET") return json({ ok: true, member_id: jeton.member_id, last_used_at: jeton.last_used_at, hint: "Envoyez un POST JSON : {\"date\":\"2026-10-26\",\"steps\":8200,\"active_kcal\":320,\"total_kcal\":2150}" });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const today = parisToday();
  const uses = jeton.uses_date === today ? jeton.uses_today : 0;
  if (uses >= 200) return json({ error: "Trop d'envois aujourd'hui (200 max)" }, 429);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Corps JSON attendu" }, 400); }
  const days = normalize(body);
  if (!days.length) return json({ error: "Aucune donnée reconnue (attendu : steps, active_kcal, total_kcal…)" }, 400);

  const rows = days.map((d) => {
    const total = d.total_kcal ?? (d.active_kcal != null && d.resting_kcal != null ? d.active_kcal + d.resting_kcal : null);
    return {
      foyer_id: jeton.foyer_id, user_id: jeton.user_id, member_id: jeton.member_id, date: d.date,
      source: (d.source || url.searchParams.get("source") || "telephone").toLowerCase().slice(0, 40), kind: "journee", ref: "",
      label: "Journée (montre)", kcal: d.active_kcal != null ? Math.round(d.active_kcal) : null, kcal_total: total != null ? Math.round(total) : null,
      steps: d.steps != null ? Math.round(d.steps) : null, minutes: d.exercise_min != null ? Math.round(d.exercise_min) : null,
      distance_m: d.distance_m != null ? Math.round(d.distance_m) : null, raw: d,
    };
  });
  const { error } = await admin.from("activites").upsert(rows, { onConflict: "member_id,date,source,ref" });
  if (error) { console.error("import-activite", error); return json({ error: "Enregistrement impossible" }, 500); }
  await admin.from("jetons_import").update({ uses_date: today, uses_today: uses + 1, last_used_at: new Date().toISOString(), last_payload: rows[rows.length - 1].raw }).eq("token", token);
  return json({ ok: true, days: rows.map((r) => ({ date: r.date, steps: r.steps, active_kcal: r.kcal, total_kcal: r.kcal_total })) });
});
