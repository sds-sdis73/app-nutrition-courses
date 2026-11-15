-- Tribu & Toutous : préférences de chaque compte (univers graphique, partage du sport, date de la dernière sauvegarde)
-- et partage « tout ou rien » du sport dans le foyer.
-- Idempotente : peut être rejouée sans risque. Aucune donnée existante n'est supprimée.
-- Le verrouillage Face ID n'a besoin de rien côté serveur : la clé d'accès et l'empreinte du code restent sur l'appareil.

-- 1. Préférences du compte : une ligne par compte, lue et modifiée par lui seul.
create table if not exists public.compte_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  univers text not null default 'classique' check (univers in ('classique', 'carnet', 'washi', 'herbier', 'cocon', 'kermesse')),
  partage_sport boolean not null default false,
  sauvegarde_le timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists compte_preferences_foyer on public.compte_preferences (foyer_id) where partage_sport;
alter table public.compte_preferences enable row level security;
drop policy if exists "proprietaire" on public.compte_preferences;
create policy "proprietaire" on public.compte_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and foyer_id = (select mon_foyer()));

-- 2. Comptes du foyer qui partagent leur sport. Security definer : chacun peut savoir QUI partage
--    dans son foyer sans pouvoir lire les autres préférences.
create or replace function public.comptes_sport_partage()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select p.user_id from public.compte_preferences p
  where p.partage_sport and p.foyer_id = public.mon_foyer()
$$;
revoke all on function public.comptes_sport_partage() from public, anon;
grant execute on function public.comptes_sport_partage() to authenticated;

-- 3. Tables du module Forme : en plus de la politique « proprietaire » (lecture et écriture de ses propres lignes),
--    LECTURE SEULE des lignes d'un membre du foyer qui partage. Aucune écriture possible sur les lignes des autres :
--    les politiques d'écriture restent celles de « proprietaire ». Les mensurations ne sont jamais partagées.
do $$
declare t text;
begin
  foreach t in array array['forme_profil', 'forme_lieux', 'forme_exercices', 'forme_objectifs', 'forme_semaines', 'forme_seances'] loop
    execute format('drop policy if exists "partage_lecture" on public.%I', t);
    execute format('create policy "partage_lecture" on public.%I for select to authenticated using (foyer_id = (select mon_foyer()) and user_id in (select public.comptes_sport_partage()))', t);
  end loop;
end $$;

-- 4. Activités écrites par le module Forme (source 'forme') : même règle, en lecture seule.
--    La politique « foyer » (toutes opérations) reste inchangée.
drop policy if exists "forme_partage_lecture" on public.activites;
create policy "forme_partage_lecture" on public.activites for select to authenticated
  using (foyer_id = (select mon_foyer()) and source = 'forme' and user_id in (select public.comptes_sport_partage()));
