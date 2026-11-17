import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Suppression du compte de l'appelant (Plus › Mon foyer › Supprimer mon compte), confirmée par { confirmation: "SUPPRIMER" }.
//  - Dernier compte d'un foyer : le foyer est supprimé avec toutes ses données (cascade sur foyers) et ses fichiers.
//  - D'autres comptes restent : le foyer continue avec tout ce qui a été saisi ; un autre compte devient administrateur
//    s'il n'y en a plus. Prérequis : migration 2026-11-17_suppression-compte.sql (sinon la base effacerait en cascade
//    ce que le compte a saisi pour la famille) ; la fonction refuse tant qu'elle manque.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Données saisies sans foyer (anciennes versions de l'appli) : effacées avec le compte.
const ANCIENNES = ["reglages", "recettes", "planning_repas", "historique_scans", "liens_produits", "courses_coches", "courses_ajouts", "foyer_membres", "journal"];

// deno-lint-ignore no-explicit-any
type Admin = any;

// Supprime tous les fichiers sous un préfixe (dossiers parcourus récursivement).
async function viderDossier(admin: Admin, bucket: string, prefixe: string): Promise<number> {
  let n = 0;
  for (let tour = 0; tour < 50; tour++) {
    const { data, error } = await admin.storage.from(bucket).list(prefixe, { limit: 1000 });
    if (error || !data?.length) break;
    const fichiers = data.filter((x: { id: string | null }) => x.id).map((x: { name: string }) => `${prefixe}/${x.name}`);
    const dossiers = data.filter((x: { id: string | null }) => !x.id).map((x: { name: string }) => `${prefixe}/${x.name}`);
    for (const d of dossiers) n += await viderDossier(admin, bucket, d);
    if (fichiers.length) { await admin.storage.from(bucket).remove(fichiers); n += fichiers.length; }
    if (data.length < 1000) break;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "Connexion requise" }, 401);
  let body: { confirmation?: string } = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  if (body.confirmation !== "SUPPRIMER") return json({ error: "Confirmation manquante" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const uid = user.id;

  // Sans la migration 2026-11-17_suppression-compte.sql, effacer le compte effacerait aussi les données de la famille.
  const { data: prete, error: e0 } = await admin.rpc("suppression_compte_prete");
  if (e0 || prete !== true) return json({ error: "Suppression indisponible pour le moment (mise à jour du serveur à appliquer)." }, 503);

  // Foyers concernés : celui du compte et ceux qu'il a créés.
  const foyers = new Set<string>();
  const { data: moi } = await admin.from("foyer_comptes").select("foyer_id").eq("user_id", uid);
  for (const c of moi ?? []) if (c.foyer_id) foyers.add(c.foyer_id);
  const { data: crees } = await admin.from("foyers").select("id").eq("created_by", uid);
  for (const f of crees ?? []) foyers.add(f.id);

  const bilan = { foyersSupprimes: 0, foyersGardes: 0, fichiers: 0 };
  for (const fid of foyers) {
    const { data: autres } = await admin.from("foyer_comptes").select("user_id, role").eq("foyer_id", fid).neq("user_id", uid).order("created_at");
    if (!autres?.length) {
      // Plus personne : le foyer part avec toutes ses données (cascade sur foyers) et ses fichiers.
      bilan.fichiers += await viderDossier(admin, "famille", fid);
      const { error } = await admin.from("foyers").delete().eq("id", fid);
      if (error) { console.error("supprimer-compte foyer", fid, error); return json({ error: "Suppression du foyer impossible" }, 500); }
      bilan.foyersSupprimes++;
      continue;
    }
    // D'autres comptes restent : le foyer et tout ce qui a été saisi restent ; il garde au moins un administrateur.
    if (!autres.some((c: { role: string }) => c.role === "admin")) await admin.from("foyer_comptes").update({ role: "admin" }).eq("foyer_id", fid).eq("user_id", autres[0].user_id);
    bilan.foyersGardes++;
  }

  for (const t of ANCIENNES) await admin.from(t).delete().eq("user_id", uid).is("foyer_id", null);
  // Photos de recettes déposées par le compte : gardées si un foyer continue (ses recettes les affichent), sinon effacées.
  if (!bilan.foyersGardes) bilan.fichiers += await viderDossier(admin, "photos-recettes", uid);

  // Le compte (et, en cascade, ses préférences, notifications, appareils et son rattachement au foyer).
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) { console.error("supprimer-compte utilisateur", error); return json({ error: "Suppression du compte impossible" }, 500); }
  return json({ ok: true, ...bilan });
});
