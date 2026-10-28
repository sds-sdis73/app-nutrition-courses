-- Miam & moi : pesées (suivi du poids) et résumé du jour lu par le widget iPhone.
-- À exécuter une fois dans Supabase › SQL Editor. Aucune donnée existante n'est modifiée.

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

-- Résumé de la journée d'un membre, écrit par l'application à chaque affichage de l'accueil, lu par le widget (Scriptable).
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
