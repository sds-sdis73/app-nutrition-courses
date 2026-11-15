-- Tribu & Toutous : module « Tâches et listes » (tâches, listes libres, listes types, envies de cadeaux).
-- À coller une fois dans Supabase › SQL Editor. Idempotente : peut être rejouée sans risque, rien n'est supprimé.
-- Visibilité : tout le foyer voit et modifie les tâches, les listes et les envies (foyer_id = mon_foyer()).
-- Exception : « je m'en occupe » (envies_reservations) n'est JAMAIS lisible par la personne concernée par l'envie.

-- 0. Membre du foyer relié au compte connecté (foyer_comptes.member_id), comme mon_foyer().
create or replace function public.mon_membre()
returns uuid language sql stable security definer set search_path = public as $$
  select member_id from public.foyer_comptes where user_id = auth.uid() limit 1
$$;
revoke all on function public.mon_membre() from public, anon;
grant execute on function public.mon_membre() to authenticated;

-- 1. Tâches (ponctuelles ou récurrentes, sans rotation : cocher crée l'occurrence suivante)
create table if not exists public.taches (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  titre text not null check (length(btrim(titre)) between 1 and 200),
  notes text check (notes is null or length(notes) <= 2000),
  responsable uuid references public.foyer_membres(id) on delete set null,
  echeance date,
  heure text check (heure is null or heure ~ '^[0-2][0-9]:[0-5][0-9]$'),
  priorite smallint not null default 0 check (priorite in (0, 1)),
  recurrence jsonb check (recurrence is null or (recurrence->>'freq') in ('jour', 'semaine', 'mois', 'an')),
  fait boolean not null default false,
  fait_le timestamptz,
  fait_par uuid,
  precedente_id uuid references public.taches(id) on delete set null,
  origine text,       -- module qui a créé la tâche (ex. 'carnet')
  origine_id text,    -- identifiant chez ce module (ex. 'chaudiere')
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.taches enable row level security;
drop policy if exists "foyer" on public.taches;
create policy "foyer" on public.taches for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));
create index if not exists taches_foyer_fait on public.taches (foyer_id, fait, echeance);
create index if not exists taches_precedente on public.taches (precedente_id);
-- Une seule tâche ouverte par origine (API des autres modules : pas de doublon).
create unique index if not exists taches_origine_ouverte on public.taches (foyer_id, origine, origine_id) where not fait and origine is not null and origine_id is not null;

-- 2. Listes (libres, ou listes types quand est_modele ; cle = liste type fournie modifiée par le foyer)
create table if not exists public.listes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  titre text not null check (length(btrim(titre)) between 1 and 120),
  genre text not null default 'libre',
  est_modele boolean not null default false,
  cle text,
  modele_id uuid references public.listes(id) on delete set null,
  date_debut date,
  date_fin date,
  archivee boolean not null default false,
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (foyer_id, cle),
  check (date_fin is null or date_debut is null or date_fin >= date_debut)
);
alter table public.listes enable row level security;
drop policy if exists "foyer" on public.listes;
create policy "foyer" on public.listes for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));
create index if not exists listes_foyer on public.listes (foyer_id);

create table if not exists public.liste_elements (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  liste_id uuid not null references public.listes(id) on delete cascade,
  texte text not null check (length(btrim(texte)) between 1 and 200),
  section text check (section is null or length(section) <= 60),
  coche boolean not null default false,
  coche_par uuid,
  coche_le timestamptz,
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.liste_elements enable row level security;
drop policy if exists "foyer" on public.liste_elements;
create policy "foyer" on public.liste_elements for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));
create index if not exists liste_elements_liste on public.liste_elements (liste_id, ordre);
create index if not exists liste_elements_foyer on public.liste_elements (foyer_id);

-- 3. Envies de cadeaux, par membre (visibles par tout le foyer, y compris la personne concernée)
create table if not exists public.envies (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  member_id uuid not null references public.foyer_membres(id) on delete cascade,
  titre text not null check (length(btrim(titre)) between 1 and 160),
  detail text check (detail is null or length(detail) <= 300),
  lien text check (lien is null or lien ~* '^https?://'),
  prix text check (prix is null or length(prix) <= 30),
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, member_id, foyer_id)  -- cible de la clé étrangère des réservations
);
alter table public.envies enable row level security;
drop policy if exists "foyer" on public.envies;
create policy "foyer" on public.envies for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));
create index if not exists envies_foyer_membre on public.envies (foyer_id, member_id);
-- Une envie ne change jamais de destinataire (sinon la personne concernée pourrait « déplacer » son envie
-- vers un autre membre pour lire la réservation) : on la supprime et on la recrée.
create or replace function public.envies_membre_fixe() returns trigger language plpgsql as $$
begin
  if new.member_id is distinct from old.member_id or new.foyer_id is distinct from old.foyer_id then
    raise exception 'une envie ne change pas de destinataire';
  end if;
  return new;
end $$;
drop trigger if exists envies_membre_fixe on public.envies;
create trigger envies_membre_fixe before update on public.envies for each row execute function public.envies_membre_fixe();

-- 4. « Je m'en occupe » : table à part, cachée à la personne concernée.
--    member_id (la personne qui reçoit) est recopié de l'envie et vérifié par la clé étrangère
--    (envie_id, member_id, foyer_id) → envies : impossible de mentir sur le bénéficiaire ; l'envie ne change
--    jamais de destinataire (déclencheur ci-dessus) et sa suppression emporte la réservation.
--    La politique exclut toute ligne dont member_id = mon_membre() : la personne concernée ne peut ni la lire,
--    ni la créer, ni la modifier, ni la supprimer. Pas de publication Realtime pour cette table.
create table if not exists public.envies_reservations (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  envie_id uuid not null unique,
  member_id uuid not null,
  offert boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (envie_id, member_id, foyer_id) references public.envies (id, member_id, foyer_id) on delete cascade
);
alter table public.envies_reservations enable row level security;
drop policy if exists "foyer_sauf_beneficiaire" on public.envies_reservations;
create policy "foyer_sauf_beneficiaire" on public.envies_reservations for all to authenticated
  using (foyer_id = (select mon_foyer()) and member_id is distinct from (select mon_membre()))
  with check (foyer_id = (select mon_foyer()) and member_id is distinct from (select mon_membre()));
create index if not exists envies_reservations_foyer on public.envies_reservations (foyer_id);

-- 5. Cochage en direct : Realtime sur les tâches, les listes, leurs éléments et les envies (RLS appliquée par Supabase).
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['taches', 'listes', 'liste_elements', 'envies'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
