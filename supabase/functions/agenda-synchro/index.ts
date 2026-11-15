import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { analyserIcs } from "../_shared/ics.js";
import { hoteInterdit, ipInterdite } from "../_shared/adresses.js";
import { basic, calendriers, corpsRequete, CORPS_CALENDRIERS, CORPS_DOSSIER, CORPS_PRINCIPAL, hrefDe, ICLOUD, motDePasseAppValide, planChangement, planSynchro, ressources } from "../_shared/caldav.js";

// Synchronisation des agendas (module « Agendas reliés »), pour un membre connecté :
//   { action: "importer", id }            lit un lien ICS (Google, Outlook, iCloud public) enregistré dans agenda_abonnements ;
//   { action: "importer", url }           essai d'un lien avant de l'ajouter (nom et nombre d'événements) ;
//   { action: "caldav-relier", identifiant, mot_de_passe }   iCloud : vérifie le compte et liste ses calendriers ;
//   { action: "caldav-choisir", url }     calendrier iCloud à synchroniser, puis première synchro ;
//   { action: "caldav-synchro" }          synchro dans les deux sens ;
//   { action: "caldav-deconnecter" }      oublie le compte (les événements restent dans l'agenda) ;
//   { action: "cron" } + x-cron-key       synchro de tous les foyers reliés (pg_cron, toutes les heures).
// L'identifiant Apple et le mot de passe d'application sont chiffrés au repos (AES-GCM, clé dérivée par HKDF de la clé
// de service, comme Monsieur Cuisine) dans agenda_caldav_secrets, table sans aucune politique RLS : seule la fonction la lit.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class Erreur extends Error { constructor(message: string, public status = 400) { super(message); } }
const JOUR = 86400000;

// ---------------------------------------------------------------------------
// Secrets chiffrés au repos
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u: Uint8Array) => { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let cleRepos: CryptoKey | null = null;
async function cle(): Promise<CryptoKey> {
  if (cleRepos) return cleRepos;
  const base = await crypto.subtle.importKey("raw", enc.encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!), "HKDF", false, ["deriveKey"]);
  cleRepos = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("tt-caldav-v1"), info: enc.encode("agenda_caldav_secrets") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return cleRepos;
}
async function sceller(obj: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cle(), enc.encode(JSON.stringify(obj))));
  return `${b64(iv)}.${b64(ct)}`;
}
async function ouvrir(s: string): Promise<Record<string, string>> {
  const [iv, ct] = s.split(".");
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await cle(), unb64(ct))));
}
type Secrets = { identifiant: string; mot_de_passe: string };
async function lireSecrets(admin: SupabaseClient, foyerId: string): Promise<Secrets> {
  const { data } = await admin.from("agenda_caldav_secrets").select("data").eq("foyer_id", foyerId).maybeSingle();
  if (!data?.data) throw new Erreur("Compte iCloud non relié", 400);
  return await ouvrir(data.data) as Secrets;
}

// ---------------------------------------------------------------------------
// Lecture d'un lien ICS
// ---------------------------------------------------------------------------
// webcal:// → https:// ; refuse les adresses locales ou privées (la fonction ne doit pas servir de relais).
function urlSure(brute: string): string {
  const s = String(brute || "").trim().replace(/^webcals?:\/\//i, "https://");
  let u: URL;
  try { u = new URL(s); } catch { throw new Erreur("Adresse invalide : copie le lien complet, qui commence par https:// ou webcal://"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Erreur("Le lien doit commencer par https:// ou webcal://");
  if (u.username || u.password || (u.port && !["80", "443"].includes(u.port))) throw new Erreur("Adresse non autorisée");
  if (hoteInterdit(u.hostname)) throw new Erreur("Adresse non autorisée");
  return u.href;
}
// Le nom doit aussi se résoudre vers des adresses publiques uniquement (un nom peut pointer vers 127.0.0.1 ou 10.x).
async function hotePublic(url: string) {
  const h = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (ipInterdite(h) !== null) return; // adresse IP déjà vérifiée par urlSure
  const ips: string[] = [];
  for (const type of ["A", "AAAA"] as const) { try { ips.push(...await Deno.resolveDns(h, type)); } catch { /* pas d'adresse de ce type */ } }
  if (!ips.length || ips.some((ip) => ipInterdite(ip) !== false)) throw new Erreur("Ce lien ne répond pas : vérifie qu'il est public et réessaie plus tard.");
}
// Lecture avec les redirections suivies à la main : chaque étape est revérifiée (5 au plus).
async function lireSure(depart: string): Promise<Response> {
  let url = urlSure(depart);
  for (let saut = 0; saut <= 5; saut++) {
    await hotePublic(url);
    let r: Response;
    try { r = await fetch(url, { headers: { Accept: "text/calendar, */*", "User-Agent": "TribuEtToutous/1.0 (agenda familial)" }, redirect: "manual", signal: AbortSignal.timeout(20000) }); }
    catch { throw new Erreur("Ce lien ne répond pas : vérifie qu'il est public et réessaie plus tard."); }
    if (r.status < 300 || r.status >= 400) return r;
    const suite = r.headers.get("Location");
    await r.body?.cancel();
    if (!suite) break;
    try { url = urlSure(new URL(suite, url).href); } catch { break; }
  }
  throw new Erreur("Ce lien ne répond pas : vérifie qu'il est public et réessaie plus tard.");
}
async function lireIcs(url: string) {
  const r = await lireSure(url);
  if (r.status === 404 || r.status === 410) throw new Erreur("Ce lien n'existe plus (le calendrier a peut-être cessé d'être partagé).");
  if (r.status === 401 || r.status === 403) throw new Erreur("Ce lien est privé : il faut l'adresse secrète ou publique du calendrier.");
  if (!r.ok) throw new Erreur(`Le serveur de ce calendrier répond en erreur (${r.status}).`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Erreur("Ce calendrier est trop gros (plus de 8 Mo).");
  return analyserIcs(dec.decode(buf), { fenetre: { depuis: new Date(Date.now() - 365 * JOUR) } });
}

// ---------------------------------------------------------------------------
// iCloud (CalDAV)
// ---------------------------------------------------------------------------
async function dav(url: string, method: string, auth: string, body?: string, extra: Record<string, string> = {}) {
  return await fetch(url, { method, headers: { Authorization: auth, "Content-Type": "application/xml; charset=utf-8", ...extra }, body, redirect: "follow", signal: AbortSignal.timeout(30000) });
}
async function multistatus(r: Response, quoi: string) {
  if (r.status === 401 || r.status === 403) throw new Erreur("iCloud refuse l'identifiant ou le mot de passe d'application. Vérifie-les, ou crée un nouveau mot de passe d'application.", 400);
  if (r.status !== 207) throw new Erreur(`iCloud ne répond pas comme prévu (${quoi} : ${r.status}).`, 502);
  return await r.text();
}
async function decouvrir(identifiant: string, motDePasse: string) {
  const auth = basic(identifiant, motDePasse);
  let r = await dav(ICLOUD, "PROPFIND", auth, CORPS_PRINCIPAL, { Depth: "0" });
  const principal = hrefDe(await multistatus(r, "compte"), "current-user-principal", r.url || ICLOUD);
  if (!principal) throw new Erreur("Compte iCloud introuvable.", 502);
  r = await dav(principal, "PROPFIND", auth, CORPS_DOSSIER, { Depth: "0" });
  const dossier = hrefDe(await multistatus(r, "dossier"), "calendar-home-set", r.url || principal);
  if (!dossier) throw new Erreur("Aucun dossier de calendriers sur ce compte iCloud.", 502);
  r = await dav(dossier, "PROPFIND", auth, CORPS_CALENDRIERS, { Depth: "1" });
  return { dossier, liste: calendriers(await multistatus(r, "calendriers"), r.url || dossier) };
}
const masquer = (id: string) => { const [n, d] = id.split("@"); return d ? `${n.slice(0, 2)}…@${d}` : `${id.slice(0, 2)}…`; };

async function synchroniser(admin: SupabaseClient, foyerId: string) {
  const { data: cx } = await admin.from("agenda_caldav").select("*").eq("foyer_id", foyerId).maybeSingle();
  if (!cx?.calendrier_url) throw new Erreur("Choisis d'abord le calendrier iCloud à synchroniser.", 400);
  try {
    const s = await lireSecrets(admin, foyerId);
    const auth = basic(s.identifiant, s.mot_de_passe);
    const maintenant = new Date();
    const depuis = new Date(+maintenant - 90 * JOUR), jusqu = new Date(+maintenant + 730 * JOUR);
    const r = await dav(cx.calendrier_url, "REPORT", auth, corpsRequete(depuis, jusqu), { Depth: "1" });
    const distants = ressources(await multistatus(r, "événements"), r.url || cx.calendrier_url);
    const [{ data: liens }, { data: locaux, error: e1 }, { data: membres }] = await Promise.all([
      admin.from("agenda_caldav_liens").select("*").eq("foyer_id", foyerId),
      admin.from("evenements").select("*").eq("foyer_id", foyerId).limit(5000),
      admin.from("foyer_membres").select("id, nom").eq("foyer_id", foyerId),
    ]);
    if (e1) throw new Erreur("Agenda du foyer illisible (migration de l'agenda appliquée ?)", 500);
    const noms = Object.fromEntries((membres ?? []).map((m: { id: string; nom: string }) => [m.id, m.nom]));
    const plan = planSynchro({ distants, liens: liens ?? [], locaux: locaux ?? [], calendrier: cx.calendrier_url, depuis, jusqu, nouvelId: () => crypto.randomUUID(), noms, maintenant });
    const propre = (l: Record<string, unknown>) => ({ ...l, membres: ((l.membres as string[]) ?? []).filter((id) => id in noms) });

    // 1) Changements venus d'iCloud → agenda du foyer.
    if (plan.creer.length) { const { error } = await admin.from("evenements").insert(plan.creer.map((l) => ({ ...propre(l), foyer_id: foyerId }))); if (error) throw new Erreur(`Import iCloud : ${error.message}`, 500); }
    for (const l of plan.maj) {
      const { id, foyer_id: _f, user_id: _u, created_at: _c, updated_at: _m, ...champs } = propre(l) as Record<string, unknown>;
      await admin.from("evenements").update(champs).eq("id", id).eq("foyer_id", foyerId);
    }
    if (plan.supprimer.length) await admin.from("evenements").delete().in("id", plan.supprimer).eq("foyer_id", foyerId);
    if (plan.liens.length) await admin.from("agenda_caldav_liens").upsert(plan.liens.map((l) => ({ ...l, foyer_id: foyerId, synchro_le: maintenant.toISOString() })), { onConflict: "foyer_id,href" });

    // 2) Changements faits dans l'appli → iCloud.
    let envoyes = 0, conflits = 0;
    for (const e of plan.envoyer) {
      const p = await fetch(e.href, { method: "PUT", headers: { Authorization: auth, "Content-Type": "text/calendar; charset=utf-8", ...(e.etag ? { "If-Match": e.etag } : { "If-None-Match": "*" }) }, body: e.ics, signal: AbortSignal.timeout(30000) });
      if (p.status === 412) { conflits++; continue; } // modifié des deux côtés : la prochaine synchro reprend la version d'iCloud
      if (!p.ok) throw new Erreur(`iCloud refuse l'envoi d'un événement (${p.status}).`, 502);
      envoyes++;
      await admin.from("agenda_caldav_liens").upsert({ ...e.lien, foyer_id: foyerId, etag: p.headers.get("ETag") ?? "", synchro_le: maintenant.toISOString() }, { onConflict: "foyer_id,href" });
    }
    for (const e of plan.effacer) {
      const d = await fetch(e.href, { method: "DELETE", headers: { Authorization: auth, ...(e.etag ? { "If-Match": e.etag } : {}) }, signal: AbortSignal.timeout(30000) });
      if (d.ok || d.status === 404 || d.status === 410) envoyes++; else conflits++;
    }
    if (plan.oublier.length) await admin.from("agenda_caldav_liens").delete().eq("foyer_id", foyerId).in("href", plan.oublier);

    const stats = { recus: plan.creer.length + plan.maj.length, supprimes: plan.supprimer.length, envoyes, conflits };
    await admin.from("agenda_caldav").update({ statut: "ok", erreur: null, dernier_synchro: maintenant.toISOString(), stats, updated_at: maintenant.toISOString() }).eq("foyer_id", foyerId);
    return stats;
  } catch (e) {
    await admin.from("agenda_caldav").update({ statut: "erreur", erreur: (e as Error).message.slice(0, 300), updated_at: new Date().toISOString() }).eq("foyer_id", foyerId);
    throw e;
  }
}

// Changement de calendrier : les événements reçus de l'ancien quittent l'agenda de la famille, et ceux que l'appli
// y avait envoyés en sont retirés (ils partent vers le nouveau calendrier à la synchro qui suit).
async function quitterCalendrier(admin: SupabaseClient, foyerId: string) {
  const [{ data: liens }, { data: locaux }] = await Promise.all([
    admin.from("agenda_caldav_liens").select("*").eq("foyer_id", foyerId),
    admin.from("evenements").select("id, source, source_uid").eq("foyer_id", foyerId).not("source", "is", null).limit(5000),
  ]);
  const p = planChangement({ liens: liens ?? [], locaux: locaux ?? [] });
  if (p.supprimer.length) await admin.from("evenements").delete().in("id", p.supprimer).eq("foyer_id", foyerId);
  if (p.detacher.length) await admin.from("evenements").update({ source: null, source_uid: null }).in("id", p.detacher).eq("foyer_id", foyerId);
  if (!p.effacer.length) return;
  try {
    const s = await lireSecrets(admin, foyerId);
    const auth = basic(s.identifiant, s.mot_de_passe);
    for (const e of p.effacer) {
      try { await fetch(e.href, { method: "DELETE", headers: { Authorization: auth, ...(e.etag ? { "If-Match": e.etag } : {}) }, signal: AbortSignal.timeout(30000) }); } catch { /* l'ancien calendrier garde cet événement */ }
    }
  } catch { /* compte iCloud illisible : l'ancien calendrier reste tel quel */ }
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: { action?: string; id?: string; url?: string; identifiant?: string; mot_de_passe?: string } = {};
  try { body = await req.json(); } catch { /* corps vide */ }

  try {
    if (body.action === "cron") {
      const { data: k } = await admin.from("config_app").select("value").eq("key", "agenda_cron_key").maybeSingle();
      if (!k?.value || req.headers.get("x-cron-key") !== k.value) return json({ error: "Clé de tâche planifiée invalide" }, 401);
      const { data: foyers } = await admin.from("agenda_caldav").select("foyer_id").in("statut", ["ok", "erreur"]).not("calendrier_url", "is", null);
      const resultats: Record<string, unknown> = {};
      for (const f of foyers ?? []) { try { resultats[f.foyer_id] = await synchroniser(admin, f.foyer_id); } catch (e) { resultats[f.foyer_id] = { erreur: (e as Error).message }; } }
      return json({ ok: true, resultats });
    }

    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Connexion requise" }, 401);
    const { data: compte } = await admin.from("foyer_comptes").select("foyer_id").eq("user_id", user.id).maybeSingle();
    const foyerId = compte?.foyer_id;
    if (!foyerId) return json({ error: "Aucun foyer pour ce compte" }, 400);

    if (body.action === "importer") {
      if (body.id) {
        const { data: abo } = await admin.from("agenda_abonnements").select("*").eq("id", body.id).eq("foyer_id", foyerId).maybeSingle();
        if (!abo) return json({ error: "Agenda introuvable" }, 404);
        try {
          const r = await lireIcs(abo.url);
          await admin.from("agenda_abonnements").update({ maj_le: new Date().toISOString(), erreur: null, nb: r.evenements.length, nom: abo.nom || r.nom || "Agenda" }).eq("id", abo.id);
          return json({ ok: true, nom: r.nom, evenements: r.evenements });
        } catch (e) {
          await admin.from("agenda_abonnements").update({ erreur: (e as Error).message.slice(0, 300) }).eq("id", abo.id);
          throw e;
        }
      }
      const r = await lireIcs(String(body.url ?? ""));
      return json({ ok: true, nom: r.nom, nb: r.evenements.length });
    }

    if (body.action === "caldav-relier") {
      const identifiant = String(body.identifiant ?? "").trim();
      const motDePasse = String(body.mot_de_passe ?? "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(identifiant)) return json({ error: "Identifiant Apple invalide : c'est l'adresse e-mail de ton compte Apple." }, 400);
      if (!motDePasseAppValide(motDePasse)) return json({ error: "Ce n'est pas un mot de passe d'application : il fait 16 lettres, sous la forme xxxx-xxxx-xxxx-xxxx." }, 400);
      const { dossier, liste } = await decouvrir(identifiant, motDePasse);
      await admin.from("agenda_caldav_secrets").upsert({ foyer_id: foyerId, data: await sceller({ identifiant, mot_de_passe: motDePasse }), updated_at: new Date().toISOString() });
      await admin.from("agenda_caldav").upsert({ foyer_id: foyerId, user_id: user.id, compte: masquer(identifiant), dossier_url: dossier, calendriers: liste, statut: "choix", erreur: null, updated_at: new Date().toISOString() });
      return json({ ok: true, calendriers: liste });
    }

    if (body.action === "caldav-choisir") {
      const { data: cx } = await admin.from("agenda_caldav").select("calendriers, calendrier_url").eq("foyer_id", foyerId).maybeSingle();
      const cal = ((cx?.calendriers ?? []) as { url: string; nom: string }[]).find((c) => c.url === body.url);
      if (!cal) return json({ error: "Calendrier inconnu : relie de nouveau iCloud." }, 400);
      if (cx?.calendrier_url && cx.calendrier_url !== cal.url) await quitterCalendrier(admin, foyerId);
      await admin.from("agenda_caldav_liens").delete().eq("foyer_id", foyerId);
      await admin.from("agenda_caldav").update({ calendrier_url: cal.url, calendrier_nom: cal.nom, statut: "ok", updated_at: new Date().toISOString() }).eq("foyer_id", foyerId);
      return json({ ok: true, stats: await synchroniser(admin, foyerId) });
    }

    if (body.action === "caldav-synchro") return json({ ok: true, stats: await synchroniser(admin, foyerId) });

    if (body.action === "caldav-deconnecter") {
      await admin.from("agenda_caldav_secrets").delete().eq("foyer_id", foyerId);
      await admin.from("agenda_caldav_liens").delete().eq("foyer_id", foyerId);
      await admin.from("agenda_caldav").delete().eq("foyer_id", foyerId);
      return json({ ok: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    const status = e instanceof Erreur ? e.status : 500;
    return json({ error: (e as Error).message || "Erreur inattendue" }, status);
  }
});
