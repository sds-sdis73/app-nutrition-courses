import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Un administrateur du foyer définit un nouveau mot de passe pour un compte du même foyer
// (remplace l'e-mail de réinitialisation, volontairement absent de l'application).

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
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "Connexion requise" }, 401);

  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = String(body.email ?? "").trim().toLowerCase();
    password = String(body.password ?? "");
  } catch { /* corps vide */ }
  if (!email) return json({ error: "Adresse e-mail manquante" }, 400);
  if (password.length < 6 || password.length > 72) return json({ error: "Le mot de passe doit contenir au moins 6 caractères" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: me } = await admin.from("foyer_comptes").select("foyer_id, role").eq("user_id", user.id).maybeSingle();
  if (!me || me.role !== "admin") return json({ error: "Seul un administrateur du foyer peut réinitialiser un mot de passe" }, 403);

  const { data: target } = await admin.from("foyer_comptes").select("user_id").eq("foyer_id", me.foyer_id).ilike("email", email).maybeSingle();
  if (!target) return json({ error: "Aucun compte de votre foyer n'a cette adresse" }, 404);

  const { error } = await admin.auth.admin.updateUserById(target.user_id, { password });
  if (error) { console.error("reset-password", error.message); return json({ error: "Modification impossible" }, 500); }
  return json({ ok: true });
});
