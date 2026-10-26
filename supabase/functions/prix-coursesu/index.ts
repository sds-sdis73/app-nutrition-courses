import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Tentative de lecture du prix d'un produit sur coursesu.com pour le magasin du foyer.
// Le site n'affiche les prix qu'avec un magasin en session : on ouvre la page du magasin
// (cookies), puis la page produit. Le site est protégé contre les robots : en cas d'échec,
// on renvoie { price: null } et l'application se rabat sur Open Prices ou une saisie manuelle.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function cookieJar() {
  const jar = new Map<string, string>();
  return {
    absorb(res: Response) {
      for (const [k, v] of res.headers.entries()) {
        if (k.toLowerCase() !== "set-cookie") continue;
        const [pair] = v.split(";");
        const i = pair.indexOf("=");
        if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      for (const v of all) { const [pair] = v.split(";"); const i = pair.indexOf("="); if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
    },
    header() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "); },
  };
}

function extractPrice(html: string): { price: number | null; unit?: string } {
  const m = html.match(/"price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/) ||
    html.match(/class="[^"]*price-sales[^"]*"[^>]*>\s*([\d]+[,.]\d{2})/) ||
    html.match(/data-price="(\d+(?:[.,]\d+)?)"/) ||
    html.match(/(\d+,\d{2})\s*€/);
  if (!m) return { price: null };
  const price = parseFloat(m[1].replace(",", "."));
  return isFinite(price) && price > 0 && price < 500 ? { price } : { price: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "Connexion requise" }, 401);

  let url = "";
  let slug = "";
  try { const b = await req.json(); url = String(b.url ?? ""); slug = String(b.store_slug ?? "").replace(/[^a-z0-9-]/gi, ""); } catch { /* corps vide */ }
  let target: URL;
  try { target = new URL(url); } catch { return json({ error: "URL invalide" }, 400); }
  if (!/(^|\.)coursesu\.com$/.test(target.hostname) || !/^\/p\//.test(target.pathname)) return json({ error: "Lien produit Courses U attendu" }, 400);

  const jar = cookieJar();
  const headers = () => ({ "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "fr-FR,fr;q=0.9", "Cookie": jar.header() });
  try {
    if (slug) {
      const r0 = await fetch(`https://www.coursesu.com/drive-${slug}`, { headers: headers(), redirect: "follow", signal: AbortSignal.timeout(8000) });
      jar.absorb(r0);
      if (!r0.ok) return json({ price: null, reason: `magasin ${r0.status}` });
    }
    const r1 = await fetch(target.toString(), { headers: headers(), redirect: "follow", signal: AbortSignal.timeout(8000) });
    jar.absorb(r1);
    if (!r1.ok) return json({ price: null, reason: `produit ${r1.status}` });
    const html = await r1.text();
    if (/captcha|arkose|no-store/i.test(html) && !/price-sales/.test(html)) return json({ price: null, reason: "prix non affiché (magasin non reconnu ou protection anti-robot)" });
    const { price } = extractPrice(html);
    return json({ price, reason: price == null ? "prix introuvable dans la page" : undefined });
  } catch (e) {
    return json({ price: null, reason: String((e as Error).message || e).slice(0, 120) });
  }
});
