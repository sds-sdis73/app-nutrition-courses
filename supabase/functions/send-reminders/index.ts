import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";
import { composerBriefing, enSilence, prefsEffectives, rappelDu, regrouper, veut } from "./regles.js";

// Appelée toutes les heures (pg_cron). Envoie à chaque appareil les notifications dues, une seule fois (table rappels_envoyes),
// selon les réglages de chaque personne (table notif_prefs ; à défaut push_abonnements.prefs, comme avant) et ses heures de silence.
// Rappels calculés ici : batch (samedi 18 h), congel (19 h, reste à sortir pour demain), bilan (20 h), courses (jour et heure choisis),
// planning (vendredi 18 h si la semaine prochaine est vide), test (à la demande).
// Module Forme (par compte, jamais au reste du foyer) : seance (1 h avant une séance prévue), dispos (dimanche 18 h).
// Nouveau : la file notif_file (briefing du soir préparé par l'appli, rappels d'événements, tâches, messages, modifications
// de l'agenda et des courses), et un briefing du soir de secours quand l'appli ne l'a pas préparé.
// Les notifications d'un même passage pour un appareil sont regroupées en une seule (réglage « regrouper »).
// Sans les tables de la migration 2026-11-16_accueil-notifications.sql, la fonction se comporte comme l'ancienne version.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const PAS_CRON_MIN = 60; // fréquence d'appel de la fonction

type Prefs = ReturnType<typeof prefsEffectives>;
type Sub = { endpoint: string; keys: unknown; prefs: Record<string, unknown> | null; foyer_id: string; user_id: string | null };
type Msg = { type: string; key: string; title: string; body: string; url?: string; user?: string };

function parisNow() {
  const f = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hour12: false });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const local = new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const dow = (local.getDay() + 6) % 7; // 0 = lundi
  return { local, hour: Number(parts.hour) % 24, dow };
}
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const absente = (e: { message?: string } | null) => !!e && /relation|does not exist|schema cache/i.test(e.message ?? "");
const SLOT_HEURE: Record<string, string> = { "petit-dejeuner": "07:30", collation: "10:30", midi: "12:30", gouter: "16:30", soir: "19:30" };

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

  const envoyer = async (s: Sub, payload: unknown) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, JSON.stringify(payload)); return true; }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 410 || code === 404) await admin.from("push_abonnements").delete().eq("endpoint", s.endpoint); return false; }
  };

  // Test à la demande : envoi immédiat à l'utilisateur appelant (heures de silence ignorées).
  if (body.test) {
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Connexion requise" }, 401);
    const { data: subs } = await admin.from("push_abonnements").select("*").eq("user_id", user.id);
    let sent = 0;
    for (const s of (subs ?? []) as Sub[]) if (await envoyer(s, { title: "Tribu & Toutous", body: "Les notifications fonctionnent sur cet appareil 👍", tag: "test" })) sent++;
    return json({ ok: true, sent });
  }

  const { local, hour, dow } = parisNow();
  const today = iso(local);
  const tomorrow = addDays(local, 1);
  const demain = iso(tomorrow);
  const maintenant = Date.now();
  const { data: allSubs } = await admin.from("push_abonnements").select("*");
  const subs = (allSubs ?? []) as Sub[];

  // Réglages par personne (table facultative).
  const lignesPrefs = new Map<string, Record<string, unknown>>();
  {
    const { data, error } = await admin.from("notif_prefs").select("*");
    if (!error) for (const l of data ?? []) lignesPrefs.set(l.user_id, l);
  }
  const prefsDe = (s: Sub): Prefs => prefsEffectives(s.user_id ? lignesPrefs.get(s.user_id) : null, s.prefs ?? {});
  const prefsCompte = (uid: string, list: Sub[]): Prefs => prefsEffectives(lignesPrefs.get(uid) ?? null, list.find((s) => s.user_id === uid)?.prefs ?? {});

  const byFoyer = new Map<string, Sub[]>();
  for (const s of subs) { const l = byFoyer.get(s.foyer_id) ?? []; l.push(s); byFoyer.set(s.foyer_id, l); }
  let sent = 0;
  let fileAbsente = false;

  for (const [foyerId, list] of byFoyer) {
    const messages: Msg[] = []; // rappels du foyer, dédoublonnés par foyer
    const perso = new Map<string, Msg[]>(); // notifications déjà dédoublonnées, par compte
    const ajouterPerso = (uid: string, m: Msg) => { const l = perso.get(uid) ?? []; l.push(m); perso.set(uid, l); };
    const wantsAny = (k: string) => list.some((s) => veut(prefsDe(s), k) && !enSilence(prefsDe(s), hour));

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
    if (hour === 20 && wantsAny("bilan")) {
      messages.push({ type: "bilan", key: today, title: "Bilan du soir", body: "Ton compagnon a hâte de faire le bilan de la journée. Un dernier coup d'œil au journal ?", url: "./#suivi" });
    }
    for (const s of list) {
      const p = prefsDe(s);
      if (veut(p, "courses") && p.courses_day === dow && p.courses_hour === hour) {
        const weekKey = iso(mondayOf(local));
        const { count } = await admin.from("planning_repas").select("id", { count: "exact", head: true }).eq("foyer_id", foyerId).eq("week", iso(addDays(mondayOf(local), dow >= 5 ? 7 : 0)));
        messages.push({ type: "courses", key: `${weekKey}:${s.endpoint.slice(-12)}`, title: "Liste de courses", body: count ? `${count} repas planifiés : votre liste est prête dans l'onglet Courses.` : "Pensez à planifier vos repas pour générer la liste de courses.", url: "./#courses" });
      }
    }

    // Forme : rappels personnels (les tables peuvent ne pas exister encore : erreurs ignorées).
    const users = [...new Set(list.map((s) => s.user_id).filter(Boolean))] as string[];
    const nextHour = `${String((hour + 1) % 24).padStart(2, "0")}:`;
    for (const uid of users) {
      const p = prefsCompte(uid, list);
      if (veut(p, "seance")) {
        const { data: ss } = await admin.from("forme_seances").select("id, heure, prevu, type").eq("user_id", uid).eq("date", today).eq("statut", "prevu");
        for (const x of ss ?? []) if (String(x.heure ?? "").startsWith(nextHour)) messages.push({ type: "seance", key: `${uid}:${x.id}`, user: uid, title: "Séance dans une heure", body: `${x.prevu?.titre ?? "Ta séance"} à ${x.heure}. Fais ton check-in avant de partir.`, url: "./#forme" });
      }
      if (dow === 6 && hour === 18 && veut(p, "dispos")) {
        const { data: pr } = await admin.from("forme_profil").select("member_id, questionnaire_fait_le").eq("user_id", uid).maybeSingle();
        if (pr?.questionnaire_fait_le) {
          const nextMonday = iso(addDays(mondayOf(local), 7));
          const { data: w } = await admin.from("forme_semaines").select("dispos").eq("member_id", pr.member_id).eq("lundi", nextMonday).maybeSingle();
          if (!(w?.dispos ?? []).length) messages.push({ type: "dispos", key: `${uid}:${nextMonday}`, user: uid, title: "Ta semaine Forme", body: "Coche tes disponibilités de la semaine : ton plan se prépare en 10 secondes.", url: "./#forme" });
        }
      }
    }

    // Comptes et membres du foyer (destinataires de la file, briefing de secours).
    const { data: comptes } = await admin.from("foyer_comptes").select("user_id, member_id").eq("foyer_id", foyerId);
    const usersDeMembres = (ids: string[]) => (comptes ?? []).filter((c) => ids.includes(c.member_id)).map((c) => c.user_id as string);

    // File notif_file : lignes dues, envoyées à chaque destinataire une seule fois, retenues pendant ses heures de silence.
    let preparees = new Set<string>();
    if (!fileAbsente) {
      const { data: file, error } = await admin.from("notif_file").select("*").eq("foyer_id", foyerId).is("envoye_le", null).lte("envoyer_a", new Date(maintenant).toISOString()).limit(500);
      if (absente(error)) fileAbsente = true;
      else {
        const { data: brief } = await admin.from("notif_file").select("id").eq("foyer_id", foyerId).like("id", `briefing:%:${demain}`);
        preparees = new Set((brief ?? []).map((b) => b.id as string));
        for (const row of file ?? []) {
          const expire = row.expire_a ? Date.parse(row.expire_a) : row.evenement_a ? Date.parse(row.evenement_a) : Date.parse(row.envoyer_a) + 12 * 3600e3;
          let dest: string[] = [...(row.pour_users ?? []), ...usersDeMembres(row.pour_membres ?? [])];
          if (!dest.length) dest = users; // personne de désigné, ou seulement un enfant sans compte : tout le foyer
          if (row.sauf_auteur) dest = dest.filter((u) => u !== row.user_id);
          let enAttente = false;
          if (maintenant < expire) {
            for (const uid of [...new Set(dest)].filter((u) => users.includes(u))) {
              const p = prefsCompte(uid, list);
              if (!veut(p, row.type)) continue;
              if (row.evenement_a && !rappelDu(Date.parse(row.evenement_a) / 60000, maintenant / 60000, p.rappel_min, PAS_CRON_MIN)) { enAttente = true; continue; }
              if (enSilence(p, hour)) { enAttente = true; continue; }
              const { error: dup } = await admin.from("rappels_envoyes").insert({ foyer_id: foyerId, type: row.type, key: `file:${row.id}:${uid}` });
              if (dup) continue; // déjà envoyé à cette personne
              ajouterPerso(uid, { type: row.type, key: row.id, title: row.titre, body: row.corps, url: row.url ?? "./" });
            }
          }
          if (!enAttente) await admin.from("notif_file").update({ envoye_le: new Date(maintenant).toISOString() }).eq("id", row.id);
        }
      }
    }

    // Briefing du soir de secours : à l'heure choisie, si l'appli ne l'a pas préparé (personne ne l'a ouverte aujourd'hui).
    const enAttenteBriefing = users.filter((uid) => { const p = prefsCompte(uid, list); return veut(p, "briefing") && p.briefing_heure === hour && !enSilence(p, hour) && !preparees.has(`briefing:${uid}:${demain}`); });
    if (enAttenteBriefing.length) {
      const elements = await elementsDemain(admin, foyerId, tomorrow, demain);
      const { data: membres } = await admin.from("foyer_membres").select("id, nom").eq("foyer_id", foyerId).order("ordre");
      for (const uid of enAttenteBriefing) {
        const moi = (comptes ?? []).find((c) => c.user_id === uid)?.member_id ?? null;
        const { data: ss } = await admin.from("forme_seances").select("heure, prevu, type").eq("user_id", uid).eq("date", demain).eq("statut", "prevu");
        const seances = (ss ?? []).map((x) => ({ type: "seance", titre: x.prevu?.titre ?? "Séance", heure: x.heure ? String(x.heure).slice(0, 5) : null, membres: moi ? [moi] : [] }));
        const b = composerBriefing({ elements: [...elements, ...seances], membres: membres ?? [], moi });
        const { error: dup } = await admin.from("rappels_envoyes").insert({ foyer_id: foyerId, type: "briefing", key: `${uid}:${demain}` });
        if (!dup) ajouterPerso(uid, { type: "briefing", key: demain, title: "Demain", body: b.resume, url: "./#aujourdhui" });
      }
    }

    // Envoi : rappels du foyer (une fois par foyer) puis notifications personnelles, regroupées par appareil.
    const parAppareil = new Map<string, Msg[]>();
    const pour = (s: Sub, m: Msg) => { const l = parAppareil.get(s.endpoint) ?? []; l.push(m); parAppareil.set(s.endpoint, l); };
    for (const msg of messages) {
      const { error } = await admin.from("rappels_envoyes").insert({ foyer_id: foyerId, type: msg.type, key: msg.key });
      if (error) continue; // déjà envoyé
      for (const s of list) {
        const p = prefsDe(s);
        if (!veut(p, msg.type) || enSilence(p, hour)) continue;
        if (msg.user && s.user_id !== msg.user) continue;
        pour(s, msg);
      }
    }
    for (const [uid, msgs] of perso) for (const s of list.filter((x) => x.user_id === uid)) for (const m of msgs) pour(s, m);
    for (const s of list) {
      const msgs = parAppareil.get(s.endpoint);
      if (!msgs?.length) continue;
      for (const payload of regrouper(msgs, prefsDe(s).regrouper)) if (await envoyer(s, payload)) sent++;
    }
  }
  return json({ ok: true, sent, at: `${today} ${hour}h` });
});

// Repas de demain pour le briefing de secours : planning de l'appli et planning Monsieur Cuisine (tables facultatives).
// deno-lint-ignore no-explicit-any
async function elementsDemain(admin: any, foyerId: string, tomorrow: Date, demain: string) {
  const out: { type: string; titre: string; heure: string | null; creneau: string; membres: string[] }[] = [];
  const { data: meals } = await admin.from("planning_repas").select("slot, recipe_id, reste_id").eq("foyer_id", foyerId).eq("week", iso(mondayOf(tomorrow))).eq("day", (tomorrow.getDay() + 6) % 7);
  const ids = [...new Set((meals ?? []).map((m: { recipe_id: string }) => m.recipe_id).filter(Boolean))];
  const { data: recs } = ids.length ? await admin.from("recettes").select("id, title").in("id", ids) : { data: [] };
  for (const m of meals ?? []) {
    if (!["midi", "soir"].includes(m.slot)) continue;
    const titre = (recs ?? []).find((r: { id: string }) => r.id === m.recipe_id)?.title ?? (m.reste_id ? "Reste" : null);
    if (titre) out.push({ type: "repas", titre, heure: SLOT_HEURE[m.slot] ?? null, creneau: m.slot, membres: [] });
  }
  if (!out.length) {
    const { data: mc, error } = await admin.from("mc_planning").select("titre").eq("foyer_id", foyerId).eq("date", demain);
    if (!error) for (const r of mc ?? []) out.push({ type: "repas", titre: r.titre, heure: null, creneau: "", membres: [] });
  }
  return out;
}
