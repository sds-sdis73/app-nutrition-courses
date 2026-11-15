import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";
import { couper } from "./regles.js";

// Appelée par l'appli juste après un envoi (module « Messages et photos ») :
//   { type: "message", id }       → nouveau message dans la discussion de la famille ;
//   { type: "photo", ids: [...] } → photos ajoutées à l'album.
// Prévient les AUTRES comptes du foyer par notification push, une seule fois (table rappels_envoyes),
// en respectant leurs réglages (Plus › Notifications) et leurs heures de silence (22 h à 7 h par défaut), heure de Paris.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Heure de Paris « HH:MM ».
function heureParis(d = new Date()) {
  const f = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`;
}
// Réglages : notif_prefs (Plus › Notifications), sinon anciens réglages de l'appareil, sinon valeurs par défaut
// (heures de silence de 22 h à 7 h) : voir ./regles.js, qui reprend les règles de send-reminders.
const court = (t: string, max = 140) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "Connexion requise" }, 401);

  let body: { type?: string; id?: string; ids?: string[] } = {};
  try { body = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: compte } = await admin.from("foyer_comptes").select("foyer_id, member_id, email").eq("user_id", user.id).maybeSingle();
  if (!compte?.foyer_id) return json({ error: "Aucun foyer" }, 403);
  let nom = (compte.email ?? "").split("@")[0] || "Quelqu'un";
  if (compte.member_id) {
    const { data: m } = await admin.from("foyer_membres").select("nom").eq("id", compte.member_id).maybeSingle();
    if (m?.nom) nom = m.nom;
  }

  // Contenu de la notification, après vérification que l'élément appartient bien à l'appelant et à son foyer.
  let msg: { type: string; key: string; title: string; body: string; tag: string; url: string };
  if (body.type === "message" && body.id) {
    const { data: m } = await admin.from("messages_famille").select("id, texte, photo, foyer_id, user_id").eq("id", body.id).maybeSingle();
    if (!m || m.user_id !== user.id || m.foyer_id !== compte.foyer_id) return json({ error: "Message introuvable" }, 404);
    const texte = String(m.texte ?? "").replace(/\s+/g, " ").trim();
    msg = { type: "message", key: m.id, title: nom, body: texte ? court(texte) : "📷 Photo", tag: "message", url: "./#messages" };
  } else if (body.type === "photo" && Array.isArray(body.ids) && body.ids.length) {
    const ids = body.ids.slice(0, 50);
    const { data: ph } = await admin.from("photos_famille").select("id, legende").in("id", ids).eq("foyer_id", compte.foyer_id).eq("user_id", user.id);
    const n = ph?.length ?? 0;
    if (!n) return json({ error: "Photos introuvables" }, 404);
    const legende = ph!.find((p) => p.legende)?.legende;
    msg = { type: "photo", key: ids.slice().sort()[0], title: "Album de famille", body: `${nom} a ajouté ${n} photo${n > 1 ? "s" : ""}${legende ? ` : ${court(legende, 80)}` : ""}`, tag: "photo", url: "./#photos" };
  } else return json({ error: "Requête invalide" }, 400);

  const { error: doublon } = await admin.from("rappels_envoyes").insert({ foyer_id: compte.foyer_id, type: msg.type, key: msg.key });
  if (doublon) return json({ ok: true, sent: 0, deja: true });

  const { data: cfg } = await admin.from("config_app").select("key,value").in("key", ["vapid_public", "vapid_private"]);
  const conf = Object.fromEntries((cfg ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  if (!conf.vapid_private) return json({ error: "Clés VAPID absentes" }, 500);
  webpush.setVapidDetails("mailto:contact@nutri-semaine.app", conf.vapid_public, conf.vapid_private);

  const heure = heureParis();
  const { data: subs } = await admin.from("push_abonnements").select("*").eq("foyer_id", compte.foyer_id).neq("user_id", user.id);
  // notif_prefs peut ne pas exister encore (migration non appliquée) : l'erreur est ignorée.
  const { data: np } = await admin.from("notif_prefs").select("*").eq("foyer_id", compte.foyer_id);
  const parUser = new Map((np ?? []).map((r: { user_id: string }) => [r.user_id, r]));
  let sent = 0;
  for (const s of subs ?? []) {
    if (couper(parUser.get(s.user_id), s.prefs ?? {}, msg.type, heure)) continue;
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg)); sent++; }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 410 || code === 404) await admin.from("push_abonnements").delete().eq("endpoint", s.endpoint); }
  }
  return json({ ok: true, sent });
});
