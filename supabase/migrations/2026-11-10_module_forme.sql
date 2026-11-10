-- Miam & moi : module « Forme » (course à pied, renfo, suivi corporel).
-- Idempotente : peut être rejouée sans risque. Aucune donnée existante n'est supprimée.
-- Confidentialité : chaque compte ne voit que SES séances et réglages Forme (user_id = auth.uid()) ;
-- les pesées restent partagées dans le foyer comme le journal (un parent pèse un enfant).

-- 1. Pesées et résumé du jour (repris de 2026-10-28_pesees_resume_jour.sql)
create table if not exists public.pesees (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  member_id uuid not null references public.foyer_membres(id) on delete cascade,
  date date not null,
  poids_kg numeric(5,2) not null check (poids_kg between 2 and 400),
  created_at timestamptz not null default now(),
  unique (member_id, date)
);
alter table public.pesees enable row level security;
drop policy if exists "foyer" on public.pesees;
create policy "foyer" on public.pesees for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));
create index if not exists pesees_foyer_date on public.pesees (foyer_id, date);

create table if not exists public.resume_jour (
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  member_id uuid not null references public.foyer_membres(id) on delete cascade,
  date date not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (member_id, date)
);
alter table public.resume_jour enable row level security;
drop policy if exists "foyer" on public.resume_jour;
create policy "foyer" on public.resume_jour for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));

-- 2. Tables du module, réservées à leur propriétaire
create table if not exists public.mensurations (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  member_id uuid not null references public.foyer_membres(id) on delete cascade,
  date date not null,
  tour_taille_cm numeric(5,1), tour_hanches_cm numeric(5,1), tour_cuisse_cm numeric(5,1), tour_bras_cm numeric(5,1),
  masse_grasse_pct numeric(4,1) check (masse_grasse_pct is null or masse_grasse_pct between 2 and 70),
  masse_musculaire_kg numeric(5,1),
  note text,
  created_at timestamptz not null default now(),
  unique (member_id, date)
);

create table if not exists public.forme_profil (
  member_id uuid primary key references public.foyer_membres(id) on delete cascade,
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  niveau text check (niveau is null or niveau in ('debutant','reprise','regulier','confirme')),
  objectif_forme text, terrain text, depart jsonb not null default '{}', genes jsonb not null default '{}', montre text,
  questionnaire_fait_le date,
  fc_repos int, fc_max int, fc_ef_min int, fc_ef_max int, fc_seuil_min int, fc_seuil_max int, vma_kmh numeric(4,1),
  modes_intensite text[] not null default '{rpe}',
  regle_budget jsonb not null default '{"perte":0.5,"maintien":1,"prise":1}',
  prefs jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.forme_lieux (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  member_id uuid not null references public.foyer_membres(id) on delete cascade,
  nom text not null, materiel text[] not null default '{}', ordre int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.forme_exercices (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  member_id uuid not null references public.foyer_membres(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.forme_objectifs (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  member_id uuid not null references public.foyer_membres(id) on delete cascade,
  nom text not null, date date not null, distance_km numeric(6,1), dplus_m int,
  created_at timestamptz not null default now()
);

create table if not exists public.forme_semaines (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  member_id uuid not null references public.foyer_membres(id) on delete cascade,
  lundi date not null, dispos jsonb not null default '[]', plan jsonb not null default '{}', cycle_semaine int,
  updated_at timestamptz not null default now(),
  unique (member_id, lundi)
);

create table if not exists public.forme_seances (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  member_id uuid not null references public.foyer_membres(id) on delete cascade,
  date date not null, heure text check (heure is null or heure ~ '^\d{2}:\d{2}$'),
  type text not null check (type in ('course','renfo','cardio','mobilite')),
  statut text not null default 'prevu' check (statut in ('prevu','fait','rate')),
  prevu jsonb not null default '{}', realise jsonb, checkin jsonb,
  duree_min int, distance_m int, dplus_m int, fc_moy int, rpe int check (rpe is null or rpe between 1 and 10), kcal numeric,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists forme_seances_member_date on public.forme_seances (member_id, date);

do $$
declare t text;
begin
  foreach t in array array['mensurations','forme_profil','forme_lieux','forme_exercices','forme_objectifs','forme_semaines','forme_seances'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "proprietaire" on public.%I', t);
    execute format('create policy "proprietaire" on public.%I for all to authenticated using (user_id = (select auth.uid()) and foyer_id = (select mon_foyer())) with check (user_id = (select auth.uid()) and foyer_id = (select mon_foyer()))', t);
  end loop;
end $$;

-- 3. Activités : les séances écrites par le module (source 'forme') ne sont visibles que de leur propriétaire.
--    Les autres activités restent partagées dans le foyer, comme avant.
drop policy if exists "foyer" on public.activites;
create policy "foyer" on public.activites for all to authenticated
  using (foyer_id = (select mon_foyer()) and (source is distinct from 'forme' or user_id = (select auth.uid())))
  with check (foyer_id = (select mon_foyer()) and (source is distinct from 'forme' or user_id = (select auth.uid())));
