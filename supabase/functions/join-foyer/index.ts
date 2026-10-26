import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Rattache le compte appelant au foyer correspondant au code d'invitation.
// Le code est vérifié côté serveur (service role) : l'utilisateur ne peut pas lire les autres foyers.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "Connexion requise" }, 401);

  let code = "";
  try { code = String((await req.json()).code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); } catch { /* corps vide */ }
  if (code.length < 6) return json({ error: "Code d'invitation invalide" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: foyer } = await admin.from("foyers").select("id, nom").eq("code_invitation", code).maybeSingle();
  if (!foyer) return json({ error: "Aucun foyer ne correspond à ce code" }, 404);

  const { data: current } = await admin.from("foyer_comptes").select("foyer_id").eq("user_id", user.id).maybeSingle();
  if (current?.foyer_id === foyer.id) return json({ error: "Vous faites déjà partie de ce foyer" }, 409);

  // Un compte n'a qu'un foyer : on remplace le rattachement. Les données de l'ancien foyer y restent.
  if (current) await admin.from("foyer_comptes").delete().eq("user_id", user.id);
  const { error } = await admin.from("foyer_comptes").insert({ foyer_id: foyer.id, user_id: user.id, role: "membre", email: user.email });
  if (error) { console.error("join-foyer", error); return json({ error: "Rattachement impossible" }, 500); }
  return json({ ok: true, foyer });
});
