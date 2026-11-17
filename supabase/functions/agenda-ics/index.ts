import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { calendrier, veventsAbonnement } from "../_shared/ics.js";

// Abonnement à l'agenda familial (module « Agendas reliés ») : GET …/agenda-ics?t=<jeton secret du foyer>.
// Le lien est ouvert par Calendrier (iPhone), Google Agenda ou Outlook, sans connexion : la fonction est déployée
// SANS vérification du jeton Supabase (--no-verify-jwt) ; seul le jeton secret (table agenda_export) donne accès.
// Le foyer régénère le jeton depuis l'appli : l'ancien lien cesse alors de marcher.
// Contenu : les événements créés dans l'appli (pas ceux importés d'iCloud, déjà dans iCloud), au fuseau Europe/Paris,
// avec les occurrences de leurs séries déplacées sur l'iPhone (UID de la série + RECURRENCE-ID).

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const texte = (body: string, status: number) => new Response(body, { status, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "HEAD") return texte("Méthode non autorisée", 405);
  const jeton = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(jeton)) return texte("Lien d'agenda invalide", 404);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: exp } = await admin.from("agenda_export").select("foyer_id, nom").eq("jeton", jeton).maybeSingle();
  if (!exp?.foyer_id) return texte("Ce lien d'agenda n'existe plus : demande le nouveau lien dans l'appli.", 404);

  const [{ data: evs, error }, { data: membres }] = await Promise.all([
    admin.from("evenements").select("*").eq("foyer_id", exp.foyer_id).or("source.is.null,source_uid.like.*#*").limit(5000),
    admin.from("foyer_membres").select("id, nom").eq("foyer_id", exp.foyer_id),
  ]);
  if (error) return texte("Agenda indisponible pour le moment", 503);
  const noms = Object.fromEntries((membres ?? []).map((m: { id: string; nom: string }) => [m.id, m.nom]));
  const maintenant = new Date();
  const corps = calendrier(veventsAbonnement(evs ?? [], { noms, maintenant }), { nom: exp.nom || "Tribu" });
  await admin.from("agenda_export").update({ lu_le: maintenant.toISOString() }).eq("foyer_id", exp.foyer_id);
  return new Response(req.method === "HEAD" ? null : corps, {
    status: 200,
    headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="tribu.ics"', "Cache-Control": "private, max-age=900" },
  });
});
