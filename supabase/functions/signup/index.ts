import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Crée un compte e-mail + mot de passe déjà confirmé (aucun e-mail envoyé).
// Le client se connecte ensuite avec signInWithPassword.

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

  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = String(body.email ?? "").trim().toLowerCase();
    password = String(body.password ?? "");
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "Adresse e-mail invalide" }, 400);
  if (password.length < 6 || password.length > 72) return json({ error: "Le mot de passe doit contenir au moins 6 caractères" }, 400);

  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (res.ok) return json({ ok: true });

  const err = await res.json().catch(() => ({}));
  const msg = String(err.msg ?? err.message ?? err.error_description ?? "");
  if (res.status === 422 || /already|registered|exists/i.test(msg)) return json({ error: "Un compte existe déjà avec cette adresse : connectez-vous" }, 409);
  if (/password/i.test(msg)) return json({ error: "Mot de passe refusé : utilisez au moins 6 caractères" }, 400);
  console.error("signup", res.status, msg);
  return json({ error: "Création du compte impossible pour le moment" }, 500);
});
