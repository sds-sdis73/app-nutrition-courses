-- 2026-11-17 : suppression d'un compte sans emporter les données de la famille.
-- Avant : effacer un compte effaçait en cascade tout ce qu'il avait saisi (recettes, planning, membres, journal…)
-- et même le foyer qu'il avait créé, alors que d'autres comptes y vivent encore.
-- Après : ces données appartiennent au foyer (les règles d'accès passent déjà par foyer_id) ; seul le foyer, quand le
-- dernier compte part, les supprime (cascade sur foyers). Les réglages personnels (préférences, notifications,
-- appareils, rattachement au foyer) partent toujours avec le compte.
-- À coller dans l'éditeur SQL de Supabase. Sans effet sur les données existantes.

alter table public.foyers           drop constraint if exists foyers_created_by_fkey;
alter table public.reglages         drop constraint if exists reglages_user_id_fkey;
alter table public.recettes         drop constraint if exists recettes_user_id_fkey;
alter table public.planning_repas   drop constraint if exists planning_repas_user_id_fkey;
alter table public.historique_scans drop constraint if exists historique_scans_user_id_fkey;
alter table public.liens_produits   drop constraint if exists liens_produits_user_id_fkey;
alter table public.courses_coches   drop constraint if exists courses_coches_user_id_fkey;
alter table public.courses_ajouts   drop constraint if exists courses_ajouts_user_id_fkey;
alter table public.foyer_membres    drop constraint if exists foyer_membres_user_id_fkey;
alter table public.journal          drop constraint if exists journal_user_id_fkey;

-- Témoin lu par la fonction supprimer-compte : elle refuse de supprimer un compte tant que cette migration manque.
create or replace function public.suppression_compte_prete() returns boolean
  language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from pg_constraint
    where contype = 'f' and confrelid = 'auth.users'::regclass and connamespace = 'public'::regnamespace
      and conname in ('foyers_created_by_fkey', 'reglages_user_id_fkey', 'recettes_user_id_fkey', 'planning_repas_user_id_fkey',
        'historique_scans_user_id_fkey', 'liens_produits_user_id_fkey', 'courses_coches_user_id_fkey', 'courses_ajouts_user_id_fkey',
        'foyer_membres_user_id_fkey', 'journal_user_id_fkey'));
$$;
revoke all on function public.suppression_compte_prete() from public, anon, authenticated;
grant execute on function public.suppression_compte_prete() to service_role;
