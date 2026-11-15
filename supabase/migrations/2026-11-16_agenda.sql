-- Tribu & Toutous : module « Agenda familial ».
-- Idempotente : peut être rejouée sans risque. Aucune donnée existante n'est modifiée.
-- Tout le foyer voit et modifie l'agenda (RLS par foyer, comme les courses et les repas).

-- 1. Événements du foyer
create table if not exists public.evenements (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),                     -- dernier compte qui a enregistré l'événement
  titre text not null check (char_length(titre) between 1 and 200),
  categorie text not null default 'evenement' check (categorie in ('evenement','rdv','activite','anniversaire')),
  debut timestamptz not null,
  fin timestamptz,                                     -- journée entière : minuit du dernier jour (inclus)
  journee boolean not null default false,
  lieu text,
  notes text,
  membres uuid[] not null default '{}',                -- membres concernés (vide = toute la famille)
  responsable uuid references public.foyer_membres(id) on delete set null,        -- « qui s'en occupe » (aller, dépôt)
  responsable_retour uuid references public.foyer_membres(id) on delete set null, -- retour
  -- { freq: quotidienne|hebdo|mensuelle|annuelle, intervalle?, jours?: [1-7, lundi = 1], jusqu?: 'AAAA-MM-JJ', nombre? }
  recurrence jsonb check (recurrence is null or recurrence->>'freq' in ('quotidienne','hebdo','mensuelle','annuelle')),
  exceptions date[] not null default '{}',             -- dates retirées de la série
  rappels jsonb not null default '[]',                 -- [{ member_id, minutes }] : un rappel par personne
  source text,                                         -- réservé à la synchronisation (ics, icloud…)
  source_uid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin is null or fin >= debut)
);
alter table public.evenements enable row level security;
drop policy if exists "foyer" on public.evenements;
create policy "foyer" on public.evenements for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));
create index if not exists evenements_foyer_debut on public.evenements (foyer_id, debut);
create index if not exists evenements_foyer_rec on public.evenements (foyer_id) where recurrence is not null;
create unique index if not exists evenements_source_uid on public.evenements (foyer_id, source, source_uid) where source_uid is not null;

create or replace function public.evenements_maj() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists evenements_maj on public.evenements;
create trigger evenements_maj before update on public.evenements for each row execute function public.evenements_maj();

-- 2. Couleur de chaque membre dans l'agenda (id = id du membre ; couleur = emplacement m1…m6 de l'univers graphique)
create table if not exists public.agenda_couleurs (
  id uuid primary key references public.foyer_membres(id) on delete cascade,
  member_id uuid references public.foyer_membres(id) on delete cascade,
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  couleur text not null check (couleur ~ '^m[1-6]$'),
  updated_at timestamptz not null default now()
);
alter table public.agenda_couleurs enable row level security;
drop policy if exists "foyer" on public.agenda_couleurs;
create policy "foyer" on public.agenda_couleurs for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));
