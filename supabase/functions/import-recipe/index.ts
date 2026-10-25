import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Récupère une page de recette et extrait le JSON-LD schema.org/Recipe.
// Ne renvoie que la recette analysée (jamais le HTML brut) pour éviter un usage en proxy ouvert.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_BYTES = 3_000_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function isPrivateHost(host: string) {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\[?[0-9a-f:]+\]?$/.test(h) && h.includes(":")) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isoMinutes(v: unknown): number {
  if (typeof v !== "string") return 0;
  const m = v.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return 0;
  return (Number(m[1] || 0) * 1440) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

function text(v: unknown): string {
  return String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

function findRecipe(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n); if (r) return r; }
    return null;
  }
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
  if (o["@graph"]) return findRecipe(o["@graph"]);
  return null;
}

function flattenSteps(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") return v.split(/\n+/).map(text).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(flattenSteps);
  const o = v as Record<string, unknown>;
  if (o.itemListElement) return flattenSteps(o.itemListElement);
  return [text(o.text ?? o.name)].filter(Boolean);
}

function firstImage(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return firstImage(v[0]);
  const o = v as Record<string, unknown>;
  return typeof o.url === "string" ? o.url : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  let url: URL;
  try {
    const body = await req.json();
    url = new URL(String(body.url));
  } catch {
    return json({ error: "URL invalide" }, 400);
  }
  if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) return json({ error: "URL non autorisée" }, 400);

  let html: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeImporter/1.0)", "Accept": "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return json({ error: `Le site a répondu ${res.status}` }, 502);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return json({ error: "Page trop volumineuse" }, 502);
    html = new TextDecoder().decode(buf);
  } catch {
    return json({ error: "Impossible de récupérer la page" }, 502);
  }

  let recipe: Record<string, unknown> | null = null;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { recipe = findRecipe(JSON.parse(m[1].trim())); } catch { /* bloc JSON invalide, on continue */ }
    if (recipe) break;
  }
  if (!recipe) return json({ error: "Aucune recette structurée trouvée sur cette page" }, 422);

  const yieldRaw = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield;
  const servings = parseInt(String(yieldRaw ?? "").match(/\d+/)?.[0] ?? "", 10) || null;
  const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : []).map(text).filter(Boolean);

  return json({
    title: text(recipe.name),
    image: firstImage(recipe.image),
    servings,
    prep_min: isoMinutes(recipe.prepTime),
    cook_min: isoMinutes(recipe.cookTime),
    ingredients,
    steps: flattenSteps(recipe.recipeInstructions),
    source_url: url.toString(),
  });
});
