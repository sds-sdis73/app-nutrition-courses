import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import forge from "npm:node-forge@1.3.1";

// Liaison Monsieur Cuisine → Miam & moi, en lecture seule (planning, liste de courses, recettes).
// Service non officiel de Tecpal / Lidl. Protocole repris de l'intégration Home Assistant
// « ha-monsieur-cuisine » (MrVain74, licence MIT) : connexion Lidl (OIDC + PKCE, faite par
// l'utilisateur dans son navigateur), échange du code, connexion chiffrée à l'appli (AES-256-CBC,
// clé enveloppée en RSA PKCS#1 v1.5), puis renouvellement du jeton.
//
// Actions (POST { action }) :
//   debut        → adresse de connexion Lidl (PKCE gardé côté serveur)
//   fin          → { adresse } : l'adresse lidl-com.monsieur-cuisine.Companion://… collée par l'utilisateur
//   synchro      → synchronise le foyer de l'appelant
//   deconnecter  → oublie les jetons du foyer
//   cron         → synchronise tous les foyers reliés (pg_cron, en-tête x-cron-key)

const API = "https://mc-api.tecpal.com";
const ACCOUNTS = "https://accounts.lidl.com";
const CLIENT_ID = "monsieurcuisineappcompanionclient";
const REDIRECT_URI = "lidl-com.monsieur-cuisine.Companion://login/prod";
const SCOPE = "openid profile offline_access";
const KEY_ID = "351756051523999";
const LANG = "fr-FR";
const MIN_INTERVAL_MS = 1000;
const MAX_DETAILS = 40;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class McErreur extends Error {
  constructor(message: string, readonly reconnexion = false) { super(message); }
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const alea = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const enc = new TextEncoder();
const dec = new TextDecoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Jetons chiffrés au repos (AES-GCM) avec une clé dérivée de la clé de service du projet.
let cleRepos: CryptoKey | null = null;
async function cle(): Promise<CryptoKey> {
  if (cleRepos) return cleRepos;
  const base = await crypto.subtle.importKey("raw", enc.encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!), "HKDF", false, ["deriveKey"]);
  cleRepos = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("miam-mc-v1"), info: enc.encode("mc_secrets") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return cleRepos;
}
async function sceller(obj: unknown): Promise<string> {
  const iv = alea(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cle(), enc.encode(JSON.stringify(obj))));
  return `${b64(iv)}.${b64(ct)}`;
}
async function ouvrir(s: string): Promise<Record<string, unknown>> {
  const [iv, ct] = s.split(".");
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await cle(), unb64(ct))));
}

// Connexion chiffrée de l'appli Monsieur Cuisine : AES-256-CBC (PKCS7) + clé AES enveloppée en RSA PKCS#1 v1.5.
async function chiffrerLogin(clair: string, clePubliqueB64: string) {
  const k = alea(32), iv = alea(16);
  const aes = await crypto.subtle.importKey("raw", k, "AES-CBC", false, ["encrypt", "decrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, aes, enc.encode(clair)));
  const der = forge.util.decode64(clePubliqueB64);
  const pub = forge.pki.publicKeyFromAsn1(forge.asn1.fromDer(der)) as forge.pki.rsa.PublicKey;
  const enveloppe = pub.encrypt(String.fromCharCode(...k), "RSAES-PKCS1-V1_5");
  return { payload: b64(ct), iv: b64(iv), xAppAes: forge.util.encode64(enveloppe), aes };
}
async function dechiffrerLogin(payload: string, iv: string, aes: CryptoKey) {
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-CBC", iv: unb64(iv) }, aes, unb64(payload)));
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------
async function pkce() {
  const verifier = b64url(alea(32));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
  return { verifier, challenge, state: b64url(alea(24)), nonce: b64url(alea(24)) };
}
function adresseConnexion(p: { challenge: string; state: string; nonce: string }) {
  const q = new URLSearchParams({ prompt: "login", response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: SCOPE,
    code_challenge: p.challenge, code_challenge_method: "S256", state: p.state, nonce: p.nonce, CountryCode: "FR", Language: LANG });
  return `${ACCOUNTS}/connect/authorize?${q}`;
}
async function jetonsLidl(form: Record<string, string>) {
  const r = await fetch(`${API}/sso/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) throw new McErreur(`Lidl a refusé la connexion (${r.status} ${body.error ?? ""}).`, true);
  return body as { access_token: string; id_token: string; refresh_token?: string };
}
async function connexionAppli(accessToken: string, idToken: string, companionAppId: string) {
  const k = await fetch(`${API}/api/v1/authkey/server/request-public-key`).then((r) => r.json()).catch(() => ({}));
  const clePub = k?.data?.serverPublicKey;
  if (!clePub) throw new McErreur("Monsieur Cuisine n'a pas fourni sa clé de connexion.");
  const c = await chiffrerLogin(JSON.stringify({ accessToken, idToken, clientId: CLIENT_ID, companionAppId }), clePub);
  const r = await fetch(`${API}/api/v2/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "x-app-aes": c.xAppAes, "x-key-id": KEY_ID, "x-encrypt-method": "AES",
      "x-request-id": crypto.randomUUID(), "device-type": "iOS", appminorversion: "14204", "accept-language": LANG },
    body: JSON.stringify({ payload: c.payload, iv: c.iv }),
  });
  const reponse = await r.json().catch(() => ({}));
  const inner = reponse?.data ?? reponse;
  if (!inner?.payload) throw new McErreur(`Connexion à Monsieur Cuisine refusée (${r.status} ${reponse?.message ?? ""}).`, true);
  const clair = JSON.parse(await dechiffrerLogin(inner.payload, inner.iv, c.aes));
  const data = clair?.data ?? clair;
  if (!data?.accessToken) throw new McErreur(`Connexion à Monsieur Cuisine sans jeton (${clair?.message ?? "réponse inattendue"}).`, true);
  return data as { accessToken: string; user?: Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Client du service (lecture seule), avec renouvellement du jeton
// ---------------------------------------------------------------------------
type Secrets = { jwt?: string; lidl_refresh?: string; companion_app_id?: string; attente?: { verifier: string; state: string; at: number } };

class Mc {
  private dernier = 0;
  modifie = false;
  constructor(public s: Secrets) {}

  private async renouveler() {
    // 1. Jeton de l'appli (valable environ 1 h, renouvelable même expiré).
    if (this.s.jwt) {
      const r = await fetch(`${API}/api/v1/token/refresh`, { method: "POST", headers: { authorization: `Bearer ${this.s.jwt}`, "content-type": "application/json", "x-request-id": crypto.randomUUID() }, body: JSON.stringify({ jwt: this.s.jwt }) });
      const b = await r.json().catch(() => ({}));
      const nouveau = b?.jwt ?? b?.data?.jwt;
      if (r.ok && nouveau) { this.s.jwt = nouveau; this.modifie = true; return; }
    }
    // 2. Sinon, nouvelle connexion à partir du jeton Lidl de longue durée.
    if (!this.s.lidl_refresh) throw new McErreur("La liaison a expiré : reconnectez Monsieur Cuisine.", true);
    const t = await jetonsLidl({ grant_type: "refresh_token", refresh_token: this.s.lidl_refresh, client_id: CLIENT_ID });
    if (t.refresh_token) this.s.lidl_refresh = t.refresh_token;
    const d = await connexionAppli(t.access_token, t.id_token, this.s.companion_app_id ?? crypto.randomUUID());
    this.s.jwt = d.accessToken;
    this.modifie = true;
  }

  async get(chemin: string, essai = true): Promise<any> {
    const attente = MIN_INTERVAL_MS - (Date.now() - this.dernier);
    if (attente > 0) await sleep(attente);
    this.dernier = Date.now();
    if (!this.s.jwt) await this.renouveler();
    const r = await fetch(`${API}/${chemin}`, { headers: { authorization: `Bearer ${this.s.jwt}`, "accept-language": LANG, accept: "application/json", "x-request-id": crypto.randomUUID() } });
    const body = await r.json().catch(() => null);
    const expire = r.status === 401 || /expired|expir/i.test(String(body?.message ?? ""));
    if (expire && essai) { await this.renouveler(); return this.get(chemin, false); }
    if (!r.ok || (body && typeof body === "object" && body.code != null && body.code !== 0)) {
      throw new McErreur(`${chemin} : ${r.status} ${body?.message ?? ""}`.trim(), r.status === 401 || r.status === 403);
    }
    return body && typeof body === "object" && "data" in body ? body.data : body;
  }
}

// ---------------------------------------------------------------------------
// Conversion des données
// ---------------------------------------------------------------------------
const liste = (d: any): any[] => (Array.isArray(d) ? d : ["items", "recipes", "results", "bookmarks", "content", "data"].map((k) => d?.[k]).find(Array.isArray) ?? []);
const image = (r: any): string | null => r?.image?.url ?? r?.imageUrl ?? r?.image ?? r?.thumbnail?.url ?? r?.thumbnail ?? r?.media?.[0]?.url ?? null;

function recette(raw: any, perso: boolean) {
  const r = raw?.recipe ?? raw;
  const s = (r?.servingSizes ?? [])[0] ?? {};
  const groupes = new Map((s.ingredientGroups ?? []).map((g: any) => [g.id, String(g.name ?? "").trim()]));
  return {
    mc_id: Number(r.id),
    titre: String(r.name ?? r.title ?? "Recette"),
    perso,
    portions: Number(s.amount ?? r.servings) || null,
    unite_portion: s.servingUnit ?? s.unit ?? null,
    duree_min: Number(s.duration ?? r.duration) || null,
    preparation_min: Number(s.preparationDuration ?? s.preparationTime) || null,
    image: typeof image(r) === "string" ? image(r) : null,
    ingredients: (s.ingredients ?? []).map((i: any) => ({ nom: i.name ?? "", quantite: i.amount ?? "", unite: i.unit ?? "", groupe: groupes.get(i.ingredientGroupId) ?? "" })),
    etapes: [...(s.steps ?? [])].sort((a: any, b: any) => (a.order ?? a.step ?? 0) - (b.order ?? b.step ?? 0)).map((e: any) => ({ titre: e.name ?? e.title ?? "", texte: e.description ?? "" })),
    nutriments: s.nutrients ?? r.nutrients ?? s.nutritionalValues ?? r.nutritionalValues ?? null,
  };
}

// Les articles de la liste de courses arrivent souvent avec la quantité dans le nom (« 20 g d'huile d'olive »,
// « 1/2 cuillère à café de cumin ») : on sépare quantité, unité et produit.
const UNITES = "kg|g|mg|ml|cl|dl|l|cuillères? à soupe|cuillères? à café|c\\. à s\\.|c\\. à c\\.|càs|càc|pincées?|gousses?|cubes?|tranches?|boîtes?|sachets?|bottes?|brins?|feuilles?|morceaux?|pièces?|filets?|poignées?|verres?|tasses?";
const RE_QTE = new RegExp(`^\\s*(\\d+\\/\\d+|\\d+(?:[.,]\\d+)?(?:\\s*[-–]\\s*\\d+(?:[.,]\\d+)?)?|½|¼|¾)\\s*(?:(${UNITES})(?![a-zà-ÿ]))?\\.?\\s*(?:de\\s+|d['’]\\s*)?(.+)$`, "i");
function separer(nom: string, quantite: unknown, unite: unknown) {
  const brut = String(nom ?? "").trim();
  if (quantite != null && String(quantite).trim() !== "") return { nom: brut, quantite: String(quantite), unite: unite ? String(unite) : null };
  const m = brut.match(RE_QTE);
  if (!m) return { nom: brut, quantite: null, unite: unite ? String(unite) : null };
  return { nom: m[3].trim(), quantite: m[1].replace(",", "."), unite: m[2] ? m[2].toLowerCase() : null };
}

// ---------------------------------------------------------------------------
// Synchronisation d'un foyer
// ---------------------------------------------------------------------------
async function enregistrerSecrets(admin: SupabaseClient, foyerId: string, s: Secrets) {
  const { error } = await admin.from("mc_secrets").upsert({ foyer_id: foyerId, data: await sceller(s), updated_at: new Date().toISOString() });
  if (error) throw error;
}
async function lireSecrets(admin: SupabaseClient, foyerId: string): Promise<Secrets> {
  const { data } = await admin.from("mc_secrets").select("data").eq("foyer_id", foyerId).maybeSingle();
  return data?.data ? (await ouvrir(data.data)) as Secrets : {};
}
const etat = (admin: SupabaseClient, foyerId: string, patch: Record<string, unknown>) =>
  admin.from("mc_connexions").update({ ...patch, updated_at: new Date().toISOString() }).eq("foyer_id", foyerId);

async function synchroniser(admin: SupabaseClient, foyerId: string) {
  const s = await lireSecrets(admin, foyerId);
  if (!s.jwt && !s.lidl_refresh) throw new McErreur("Monsieur Cuisine n'est pas relié.", true);
  const mc = new Mc(s);
  const maintenant = new Date();
  try {
    // Planning : la semaine dernière, celle-ci et les deux suivantes (le service refuse plus d'un mois par demande).
    const lundi = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - ((maintenant.getDay() + 6) % 7));
    const debut = new Date(lundi.getTime() - 7 * 864e5), fin = new Date(lundi.getTime() + 21 * 864e5 - 1000);
    const plan = await mc.get(`api/v1/users/weeklyPlanner/detail/${Math.floor(debut.getTime() / 1000)}/${Math.floor(fin.getTime() / 1000)}`);
    const entrees = (Array.isArray(plan) ? plan : plan?.weeklyPlanner ?? []).filter((e: any) => String(e?.plannedTime ?? "").length >= 10);
    const lignesPlan = entrees.map((e: any) => ({
      foyer_id: foyerId, mc_id: String(e.id), date: String(e.plannedTime).slice(0, 10), recette_mc_id: Number(e.recipe?.id) || null,
      titre: String(e.recipe?.name ?? "Recette"), portions: Number(e.portions ?? e.servings ?? e.recipe?.servings) || null,
      duree_min: Number(e.recipe?.duration) || null, image: typeof image(e.recipe) === "string" ? image(e.recipe) : null, data: e, updated_at: maintenant.toISOString(),
    }));
    await admin.from("mc_planning").delete().eq("foyer_id", foyerId).gte("date", iso(debut)).lte("date", iso(fin));
    if (lignesPlan.length) { const { error } = await admin.from("mc_planning").upsert(lignesPlan); if (error) throw error; }

    // Liste de courses : ingrédients des recettes et articles ajoutés à la main.
    const courses = await mc.get("api/v1/users/shoppingList");
    const lignesCourses: Record<string, unknown>[] = [];
    for (const sr of courses?.shoppingListRecipes ?? []) {
      const r = sr.recipe ?? {};
      for (const z of r.ingredients ?? []) {
        const q = separer(z.name ?? "?", z.amount, z.unit);
        lignesCourses.push({ foyer_id: foyerId, mc_id: `r:${z.id}`, nom: q.nom, quantite: q.quantite, unite: q.unite,
          rayon: z.ingredientCategory?.name ?? null, rayon_ordre: z.ingredientCategory?.order ?? null, coche: !!z.isTicked, recette: r.name ?? null, updated_at: maintenant.toISOString() });
      }
    }
    for (const c of courses?.shoppingListCustomItems ?? []) {
      const q = separer(c.name ?? "?", c.amount, null);
      lignesCourses.push({ foyer_id: foyerId, mc_id: `c:${c.id}`, nom: q.nom, quantite: q.quantite, unite: q.unite, rayon: null, rayon_ordre: null,
        coche: !!c.isTicked, recette: null, updated_at: maintenant.toISOString() });
    }
    await admin.from("mc_courses").delete().eq("foyer_id", foyerId);
    if (lignesCourses.length) { const { error } = await admin.from("mc_courses").upsert(lignesCourses); if (error) throw error; }

    // Recettes : les miennes, mes favoris, et celles du planning (détail complet, au plus MAX_DETAILS par passage).
    const perso = liste(await mc.get("api/v3/auth/user/recipes?size=50&page=1&sortBy%5B0%5D%5Bfield%5D=lastUpdated&sortBy%5B0%5D%5Bdirection%5D=DESC&q="));
    let favoris: any[] = [];
    try { favoris = liste(await mc.get("api/v2/bookmarks/recipe/details/page/1/size/50")); } catch (e) { console.warn("favoris", e); }
    const voulues = new Map<number, { perso: boolean; favori: boolean }>();
    for (const r of perso) if (r?.id) voulues.set(Number(r.id), { perso: true, favori: false });
    for (const r of favoris) { const id = Number(r?.id ?? r?.recipeId ?? r?.recipe?.id); if (id) voulues.set(id, { perso: voulues.get(id)?.perso ?? false, favori: true }); }
    for (const l of lignesPlan) if (l.recette_mc_id && !voulues.has(l.recette_mc_id)) voulues.set(l.recette_mc_id, { perso: false, favori: false });
    const { data: deja } = await admin.from("mc_recettes").select("mc_id, updated_at").eq("foyer_id", foyerId);
    const fraiches = new Set((deja ?? []).filter((d) => Date.now() - new Date(d.updated_at).getTime() < 7 * 864e5).map((d) => Number(d.mc_id)));
    let details = 0;
    for (const [id, f] of voulues) {
      if (fraiches.has(id)) { await admin.from("mc_recettes").update({ perso: f.perso, favori: f.favori }).eq("foyer_id", foyerId).eq("mc_id", id); continue; }
      if (details >= MAX_DETAILS) continue;
      details++;
      try {
        const brut = f.perso ? await mc.get(`api/v3/auth/user/recipes/${id}`) : await mc.get(`api/v2/recipes/${id}`);
        const r = recette(brut, f.perso);
        const { error } = await admin.from("mc_recettes").upsert({ foyer_id: foyerId, ...r, mc_id: id, favori: f.favori, brut, updated_at: maintenant.toISOString() });
        if (error) throw error;
      } catch (e) { console.warn("recette", id, e); }
    }
    const stats = { planning: lignesPlan.length, courses: lignesCourses.length, recettes: voulues.size, details, at: maintenant.toISOString() };
    await etat(admin, foyerId, { statut: "ok", erreur: null, derniere_synchro: maintenant.toISOString(), stats });
    return stats;
  } catch (e) {
    const err = e instanceof McErreur ? e : new McErreur(String((e as Error)?.message ?? e));
    await etat(admin, foyerId, { statut: err.reconnexion ? "deconnecte" : "erreur", erreur: err.message });
    throw err;
  } finally {
    if (mc.modifie) await enregistrerSecrets(admin, foyerId, mc.s);
  }
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: { action?: string; adresse?: string } = {};
  try { body = await req.json(); } catch { /* corps vide */ }

  try {
    if (body.action === "cron") {
      const { data: k } = await admin.from("config_app").select("value").eq("key", "mc_cron_key").maybeSingle();
      if (!k?.value || req.headers.get("x-cron-key") !== k.value) return json({ error: "Clé de tâche planifiée invalide" }, 401);
      const { data: foyers } = await admin.from("mc_connexions").select("foyer_id").in("statut", ["ok", "erreur"]);
      const resultats: Record<string, unknown> = {};
      for (const f of foyers ?? []) { try { resultats[f.foyer_id] = await synchroniser(admin, f.foyer_id); } catch (e) { resultats[f.foyer_id] = { erreur: (e as Error).message }; } }
      return json({ ok: true, resultats });
    }

    // Les autres actions sont faites par un membre connecté, pour son foyer.
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Connexion requise" }, 401);
    const { data: compte } = await admin.from("foyer_comptes").select("foyer_id").eq("user_id", user.id).maybeSingle();
    const foyerId = compte?.foyer_id;
    if (!foyerId) return json({ error: "Aucun foyer pour ce compte" }, 400);

    if (body.action === "debut") {
      const p = await pkce();
      const s = await lireSecrets(admin, foyerId);
      await enregistrerSecrets(admin, foyerId, { ...s, attente: { verifier: p.verifier, state: p.state, at: Date.now() } });
      const { data: deja } = await admin.from("mc_connexions").select("statut").eq("foyer_id", foyerId).maybeSingle();
      if (!deja) await admin.from("mc_connexions").insert({ foyer_id: foyerId, user_id: user.id, statut: "attente" });
      return json({ url: adresseConnexion(p) });
    }

    if (body.action === "fin") {
      const texte = String(body.adresse ?? "").trim();
      const code = texte.match(/[?&#]code=([^&\s#]+)/)?.[1] ?? (/^[A-Za-z0-9._~-]{20,}$/.test(texte) ? texte : null);
      if (!code) return json({ error: "Je ne trouve pas de code dans ce texte. Collez l'adresse complète qui commence par lidl-com.monsieur-cuisine.Companion://" }, 400);
      const s = await lireSecrets(admin, foyerId);
      if (!s.attente || Date.now() - s.attente.at > 20 * 60_000) return json({ error: "La demande de connexion a expiré : recommencez depuis « Relier Monsieur Cuisine »." }, 400);
      const etatRecu = texte.match(/[?&#]state=([^&\s#]+)/)?.[1];
      if (etatRecu && decodeURIComponent(etatRecu) !== s.attente.state) return json({ error: "Cette adresse ne correspond pas à la dernière demande de connexion : recommencez." }, 400);
      const t = await jetonsLidl({ grant_type: "authorization_code", code: decodeURIComponent(code), code_verifier: s.attente.verifier, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID });
      const companion = s.companion_app_id ?? crypto.randomUUID();
      const d = await connexionAppli(t.access_token, t.id_token, companion);
      await enregistrerSecrets(admin, foyerId, { jwt: d.accessToken, lidl_refresh: t.refresh_token, companion_app_id: companion });
      const u = d.user ?? {};
      const nom = String(u.email ?? u.name ?? u.firstName ?? "compte Monsieur Cuisine");
      await admin.from("mc_connexions").upsert({ foyer_id: foyerId, user_id: user.id, statut: "ok", compte: nom, erreur: null, updated_at: new Date().toISOString() });
      const stats = await synchroniser(admin, foyerId);
      return json({ ok: true, compte: nom, stats });
    }

    if (body.action === "synchro") return json({ ok: true, stats: await synchroniser(admin, foyerId) });

    if (body.action === "deconnecter") {
      await admin.from("mc_secrets").delete().eq("foyer_id", foyerId);
      await etat(admin, foyerId, { statut: "deconnecte", erreur: null });
      return json({ ok: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erreur", reconnexion: e instanceof McErreur ? e.reconnexion : false }, 502);
  }
});
