import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

// Appelée toutes les heures (pg_cron). Envoie les rappels dus à chaque abonnement push, une seule fois (table rappels_envoyes).
// Types : batch (samedi 18 h, session du lendemain), congel (19 h, sortir un reste pour demain),
// courses (jour/heure choisis), planning (vendredi 18 h si la semaine prochaine est vide), test (à la demande).

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function parisNow() {
  const f = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hour12: false });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const local = new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const dow = (local.getDay() + 6) % 7; // 0 = lundi
  return { local, hour: Number(parts.hour) % 24, dow };
}
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg } = await admin.from("config_app").select("key,value").in("key", ["vapid_public", "vapid_private"]);
  const conf = Object.fromEntries((cfg ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  if (!conf.vapid_private) return json({ error: "Clés VAPID absentes" }, 500);
  webpush.setVapidDetails("mailto:contact@nutri-semaine.app", conf.vapid_public, conf.vapid_private);

  let body: { test?: boolean; user_id?: string } = {};
  try { body = await req.json(); } catch { /* appel cron sans corps */ }

  // Test à la demande : envoi immédiat à l'utilisateur appelant.
  if (body.test) {
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Connexion requise" }, 401);
    const { data: subs } = await admin.from("push_abonnements").select("*").eq("user_id", user.id);
    let sent = 0;
    for (const s of subs ?? []) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: "Nutri Semaine", body: "Les rappels fonctionnent sur cet appareil 👍", tag: "test" })); sent++; }
      catch (e) { if ((e as { statusCode?: number }).statusCode === 410 || (e as { statusCode?: number }).statusCode === 404) await admin.from("push_abonnements").delete().eq("endpoint", s.endpoint); }
    }
    return json({ ok: true, sent });
  }

  const { local, hour, dow } = parisNow();
  const today = iso(local);
  const tomorrow = addDays(local, 1);
  const { data: subs } = await admin.from("push_abonnements").select("*");
  const byFoyer = new Map<string, typeof subs>();
  for (const s of subs ?? []) { const l = byFoyer.get(s.foyer_id) ?? []; l.push(s); byFoyer.set(s.foyer_id, l); }
  let sent = 0;

  for (const [foyerId, list] of byFoyer) {
    const messages: { type: string; key: string; title: string; body: string; url?: string }[] = [];
    const wantsAny = (k: string) => list!.some((s) => (s.prefs ?? {})[k] !== false);

    if (hour === 19 && wantsAny("congel")) {
      const { data: meals } = await admin.from("planning_repas").select("day, slot, reste_id, week").eq("foyer_id", foyerId).eq("week", iso(mondayOf(tomorrow))).eq("day", (tomorrow.getDay() + 6) % 7).not("reste_id", "is", null);
      for (const m of meals ?? []) {
        const { data: r } = await admin.from("restes").select("stockage, recipe_id").eq("id", m.reste_id).maybeSingle();
        if (r?.stockage !== "congel") continue;
        const { data: rec } = await admin.from("recettes").select("title").eq("id", r.recipe_id).maybeSingle();
        messages.push({ type: "congel", key: `${today}:${m.reste_id}`, title: "À sortir du congélateur", body: `${rec?.title ?? "Un reste"} est prévu demain ${m.slot}. Sortez-le ce soir au réfrigérateur.`, url: "./#planning" });
      }
    }
    if (dow === 5 && hour === 18 && wantsAny("batch")) {
      const nextMonday = iso(addDays(mondayOf(local), 7));
      const { data: meals } = await admin.from("planning_repas").select("recipe_id, reste_id").eq("foyer_id", foyerId).eq("week", nextMonday);
      const ids = [...new Set((meals ?? []).filter((m) => !m.reste_id).map((m) => m.recipe_id))];
      if (ids.length) {
        const { data: recs } = await admin.from("recettes").select("title, steps").in("id", ids);
        const ahead = (recs ?? []).filter((r) => (r.steps ?? []).some((s: { ahead?: boolean }) => s.ahead));
        if (ahead.length) messages.push({ type: "batch", key: nextMonday, title: "Batch cooking demain", body: `${ahead.length} recette${ahead.length > 1 ? "s" : ""} de la semaine prochaine se prépare${ahead.length > 1 ? "nt" : ""} à l'avance. La session est détaillée dans l'onglet Batch.`, url: "./#batch" });
      }
    }
    if (dow === 4 && hour === 18 && wantsAny("planning")) {
      const nextMonday = iso(addDays(mondayOf(local), 7));
      const { count } = await admin.from("planning_repas").select("id", { count: "exact", head: true }).eq("foyer_id", foyerId).eq("week", nextMonday);
      if (!count) messages.push({ type: "planning", key: nextMonday, title: "Semaine prochaine à planifier", body: "Aucun repas n'est encore prévu pour la semaine prochaine. Deux minutes suffisent pour la remplir.", url: "./#planning" });
    }
    for (const s of list!) {
      const p = s.prefs ?? {};
      if (p.courses !== false && Number(p.courses_day ?? 5) === dow && Number(p.courses_hour ?? 9) === hour) {
        const weekKey = iso(mondayOf(local));
        const { count } = await admin.from("planning_repas").select("id", { count: "exact", head: true }).eq("foyer_id", foyerId).eq("week", iso(addDays(mondayOf(local), dow >= 5 ? 7 : 0)));
        messages.push({ type: "courses", key: `${weekKey}:${s.endpoint.slice(-12)}`, title: "Liste de courses", body: count ? `${count} repas planifiés : votre liste est prête dans l'onglet Courses.` : "Pensez à planifier vos repas pour générer la liste de courses.", url: "./#courses" });
      }
    }

    for (const msg of messages) {
      const { error } = await admin.from("rappels_envoyes").insert({ foyer_id: foyerId, type: msg.type, key: msg.key });
      if (error) continue; // déjà envoyé
      for (const s of list!) {
        if ((s.prefs ?? {})[msg.type] === false) continue;
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg)); sent++; }
        catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 410 || code === 404) await admin.from("push_abonnements").delete().eq("endpoint", s.endpoint); }
      }
    }
  }
  return json({ ok: true, sent, at: `${today} ${hour}h` });
});
