-- Tribu & Toutous : module « Carnet de la famille » (Famille › Carnet).
-- Santé (rendez-vous, vaccins, contacts santé), maison, véhicules et animaux (échéances périodiques),
-- budget du mois (catégories, dépenses, abonnements et prélèvements) et contacts utiles.
-- Tout est visible et modifiable par le foyer (RLS foyer_id = mon_foyer()). Idempotente, à coller dans l'éditeur SQL.
-- Données de santé réduites au strict nécessaire : ni diagnostic, ni traitement, ni numéro de sécurité sociale.

-- Rendez-vous médicaux (alimentent l'agenda familial).
create table if not exists public.carnet_rdv (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  member_id uuid references public.foyer_membres(id) on delete set null,
  titre text not null check (char_length(titre) between 1 and 80),
  date date not null,
  heure time,
  contact_id uuid,
  lieu text check (char_length(lieu) <= 120),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists carnet_rdv_date on public.carnet_rdv (foyer_id, date);

-- Doses de vaccin faites (le calendrier vaccinal lui-même est dans l'appli).
create table if not exists public.carnet_vaccins (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  member_id uuid not null references public.foyer_membres(id) on delete cascade,
  dose text not null check (dose ~ '^[a-z0-9-]{2,30}$'),
  fait_le date,
  created_at timestamptz not null default now(),
  unique (member_id, dose)
);

-- Échéances périodiques : maison, véhicules, animaux (chaudière, contrôle technique, vermifuge, croquettes…).
create table if not exists public.carnet_echeances (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  categorie text not null check (categorie in ('maison', 'vehicule', 'animal')),
  titre text not null check (char_length(titre) between 1 and 80),
  sujet text check (char_length(sujet) <= 60),
  periode_nb int check (periode_nb between 1 and 120),
  periode_unite text check (periode_unite in ('jour', 'semaine', 'mois', 'an')),
  dernier date,
  prochain date,
  tache_pour date,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);

-- Budget du mois : catégories et montant prévu par mois.
create table if not exists public.carnet_categories (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  nom text not null check (char_length(nom) between 1 and 40),
  montant numeric(10, 2) not null default 0 check (montant >= 0),
  ordre int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.carnet_depenses (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  date date not null,
  montant numeric(10, 2) not null check (montant > 0),
  categorie_id uuid references public.carnet_categories(id) on delete set null,
  libelle text check (char_length(libelle) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists carnet_depenses_date on public.carnet_depenses (foyer_id, date);

-- Abonnements et prélèvements : une date de prélèvement de référence et une périodicité.
create table if not exists public.carnet_abonnements (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  libelle text not null check (char_length(libelle) between 1 and 60),
  montant numeric(10, 2) not null check (montant > 0),
  categorie_id uuid references public.carnet_categories(id) on delete set null,
  date_ref date not null,
  periode_nb int not null default 1 check (periode_nb between 1 and 120),
  periode_unite text not null default 'mois' check (periode_unite in ('semaine', 'mois', 'an')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Contacts utiles (santé, garde de Zoé, voisins…) ; les numéros d'urgence sont dans l'appli.
create table if not exists public.carnet_contacts (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  nom text not null check (char_length(nom) between 1 and 60),
  groupe text not null default 'autres' check (groupe in ('sante', 'garde', 'voisins', 'autres')),
  role text check (char_length(role) <= 40),
  telephone text check (char_length(telephone) <= 30),
  adresse text check (char_length(adresse) <= 160),
  note text check (char_length(note) <= 300),
  ordre int not null default 0,
  created_at timestamptz not null default now()
);

-- RLS : tout le foyer lit et écrit ; une ligne ne peut être créée ou déplacée que dans son propre foyer.
do $$
declare t text;
begin
  foreach t in array array['carnet_rdv', 'carnet_vaccins', 'carnet_echeances', 'carnet_categories', 'carnet_depenses', 'carnet_abonnements', 'carnet_contacts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "foyer" on public.%I', t);
    execute format('create policy "foyer" on public.%I for all to authenticated using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()))', t);
  end loop;
end $$;
