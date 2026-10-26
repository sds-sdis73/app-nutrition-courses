import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Connexion OAuth 2 aux services de montres (Polar, Withings, Oura, Strava).
//  GET  ?action=start&provider=…&member=…&access_token=…&back=…  → redirection vers le service
//  GET  /callback/<provider>?code=…&state=…                       → échange du code, enregistrement, retour à l'app
//  POST { action: "disconnect", id }  (Authorization: Bearer <jwt>) → suppression de la connexion
// Les identifiants d'application sont des secrets Edge : POLAR_CLIENT_ID/SECRET, WITHINGS_…, OURA_…, STRAVA_….

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const FN = `${SUPABASE_URL}/functions/v1/oauth-montre`;
const PROVIDERS: Record<string, { auth: string; token: string; scope: string; extra?: Record<string, string> }> = {
  polar: { auth: "https://flow.polar.com/oauth2/authorization", token: "https://polarremote.com/v2/oauth2/token", scope: "accesslink.read_all" },
  withings: { auth: "https://account.withings.com/oauth2_user/authorize2", token: "https://wbsapi.withings.net/v2/oauth2", scope: "user.activity,user.metrics" },
  oura: { auth: "https://cloud.ouraring.com/oauth/authorize", token: "https://api.ouraring.com/oauth/token", scope: "daily personal" },
  strava: { auth: "https://www.strava.com/oauth/authorize", token: "https://www.strava.com/oauth/token", scope: "activity:read_all", extra: { approval_prompt: "auto" } },
};
const creds = (p: string) => ({ id: Deno.env.get(`${p.toUpperCase()}_CLIENT_ID`) ?? "", secret: Deno.env.get(`${p.toUpperCase()}_CLIENT_SECRET`) ?? "" });
const redirectUri = (p: string) => `${FN}/callback/${p}`;
const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
async function sign(payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64u(String.fromCharCode(...new Uint8Array(sig)));
}
const back = (url: string, params: Record<string, string>) => {
  const u = new URL(url || "https://sds-sdis73.github.io/app-nutrition-courses/");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.hash = "suivi";
  return Response.redirect(u.toString(), 302);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // --- Début du flux ---
  if (req.method === "GET" && url.searchParams.get("action") === "start") {
    const provider = url.searchParams.get("provider") ?? "";
    const member = url.searchParams.get("member") ?? "";
    const backUrl = url.searchParams.get("back") ?? "";
    const cfg = PROVIDERS[provider];
    if (!cfg) return json({ error: "Service inconnu" }, 400);
    const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${url.searchParams.get("access_token") ?? ""}` } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return back(backUrl, { montre: "erreur", detail: "Session expirée, reconnectez-vous" });
    const { data: compte } = await admin.from("foyer_comptes").select("foyer_id").eq("user_id", user.id).maybeSingle();
    const { data: mem } = await admin.from("foyer_membres").select("id").eq("id", member).eq("foyer_id", compte?.foyer_id ?? "").maybeSingle();
    if (!mem) return back(backUrl, { montre: "erreur", detail: "Membre introuvable" });
    const { id } = creds(provider);
    if (!id) return back(backUrl, { montre: "erreur", detail: `${provider} : identifiants d'application non configurés (secret ${provider.toUpperCase()}_CLIENT_ID)` });
    const payload = b64u(JSON.stringify({ p: provider, m: member, f: compte!.foyer_id, u: user.id, b: backUrl, t: Date.now() }));
    const state = `${payload}.${await sign(payload)}`;
    const target = new URL(cfg.auth);
    target.searchParams.set("response_type", "code");
    target.searchParams.set("client_id", id);
    target.searchParams.set("redirect_uri", redirectUri(provider));
    target.searchParams.set("scope", cfg.scope);
    target.searchParams.set("state", state);
    for (const [k, v] of Object.entries(cfg.extra ?? {})) target.searchParams.set(k, v);
    return Response.redirect(target.toString(), 302);
  }

  // --- Retour du service ---
  const cb = url.pathname.match(/\/callback\/(\w+)$/);
  if (req.method === "GET" && cb) {
    const provider = cb[1];
    const cfg = PROVIDERS[provider];
    const [payload, sig] = (url.searchParams.get("state") ?? "").split(".");
    let st: { p: string; m: string; f: string; u: string; b: string; t: number };
    try { st = JSON.parse(unb64u(payload)); } catch { return json({ error: "state invalide" }, 400); }
    if (!cfg || st.p !== provider || sig !== await sign(payload) || Date.now() - st.t > 20 * 60 * 1000) return back(st?.b, { montre: "erreur", detail: "Retour invalide ou expiré" });
    const err = url.searchParams.get("error");
    if (err) return back(st.b, { montre: "erreur", detail: `Refusé par ${provider} (${err})` });
    const code = url.searchParams.get("code") ?? "";
    const { id, secret } = creds(provider);
    try {
      let tok: Record<string, unknown>;
      if (provider === "polar") {
        const r = await fetch(cfg.token, { method: "POST", headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json;charset=UTF-8" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(provider) }) });
        tok = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(tok));
        // Enregistrement de l'utilisateur AccessLink (409 = déjà enregistré).
        await fetch("https://www.polaraccesslink.com/v3/users", { method: "POST", headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ "member-id": st.m }) });
      } else if (provider === "withings") {
        const r = await fetch(cfg.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "requesttoken", grant_type: "authorization_code", client_id: id, client_secret: secret, code, redirect_uri: redirectUri(provider) }) });
        const j = await r.json();
        if (j.status !== 0) throw new Error(JSON.stringify(j));
        tok = j.body;
      } else {
        const r = await fetch(cfg.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: id, client_secret: secret, redirect_uri: redirectUri(provider) }) });
        tok = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(tok));
      }
      const expiresAt = tok.expires_at ? new Date(Number(tok.expires_at) * 1000) : tok.expires_in ? new Date(Date.now() + Number(tok.expires_in) * 1000) : null;
      const externalId = String(tok.x_user_id ?? tok.userid ?? (tok.athlete as { id?: number })?.id ?? "");
      const { error } = await admin.from("connexions_montres").upsert({
        foyer_id: st.f, member_id: st.m, provider, external_id: externalId, access_token: String(tok.access_token), refresh_token: tok.refresh_token ? String(tok.refresh_token) : null,
        expires_at: expiresAt?.toISOString() ?? null, scope: String(tok.scope ?? cfg.scope), last_error: null,
      }, { onConflict: "member_id,provider" });
      if (error) throw error;
      // Première synchronisation immédiate (sans bloquer le retour).
      fetch(`${SUPABASE_URL}/functions/v1/sync-montres`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` }, body: JSON.stringify({ member_id: st.m, provider }) }).catch(() => {});
      return back(st.b, { montre: "ok", provider });
    } catch (e) {
      console.error("oauth", provider, e);
      return back(st.b, { montre: "erreur", detail: `Échange du code refusé par ${provider}` });
    }
  }

  // --- Déconnexion ---
  if (req.method === "POST") {
    const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Connexion requise" }, 401);
    let body: { action?: string; id?: string } = {};
    try { body = await req.json(); } catch { /* vide */ }
    if (body.action !== "disconnect" || !body.id) return json({ error: "Action inconnue" }, 400);
    const { data: compte } = await admin.from("foyer_comptes").select("foyer_id").eq("user_id", user.id).maybeSingle();
    const { data: cx } = await admin.from("connexions_montres").select("id, provider, access_token").eq("id", body.id).eq("foyer_id", compte?.foyer_id ?? "").maybeSingle();
    if (!cx) return json({ error: "Connexion introuvable" }, 404);
    if (cx.provider === "strava") await fetch("https://www.strava.com/oauth/revoke", { method: "POST", headers: { Authorization: `Bearer ${cx.access_token}` } }).catch(() => {});
    await admin.from("connexions_montres").delete().eq("id", cx.id);
    return json({ ok: true });
  }
  return json({ error: "Requête non reconnue" }, 400);
});
