-- Tribu & Toutous : TOUTES les migrations du 2026-11-16, dans l'ordre, en un seul collage.
-- Idempotent : peut être rejoué sans risque (chaque partie l'est). Prérequis déjà en place : 2026-11-10_module_forme.sql et 2026-11-15_monsieur_cuisine.sql.
-- Ce fichier est généré par concaténation des fichiers 2026-11-16_<module>.sql : en cas de modification, modifier le fichier du module et régénérer.

-- ============================================================================
-- agenda (2026-11-16_agenda.sql)
-- ============================================================================
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

-- ============================================================================
-- agenda-synchro (2026-11-16_agenda-synchro.sql)
-- ============================================================================
-- Tribu & Toutous : module « Agendas reliés » (synchronisation des agendas).
-- Idempotente : peut être rejouée sans risque. À coller APRÈS 2026-11-16_agenda.sql (table evenements).
-- Fonctions Edge liées : agenda-ics (à déployer SANS vérification JWT : --no-verify-jwt) et agenda-synchro.

-- 1. Lien privé d'abonnement (export .ics) : un jeton secret par foyer, régénérable depuis l'appli.
create table if not exists public.agenda_export (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null unique default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  jeton text not null unique check (char_length(jeton) between 32 and 128),
  nom text not null default 'Tribu & Toutous',
  lu_le timestamptz,                                   -- dernière lecture par un agenda abonné (écrite par la fonction)
  created_at timestamptz not null default now()
);
alter table public.agenda_export enable row level security;
drop policy if exists "foyer" on public.agenda_export;
create policy "foyer" on public.agenda_export for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));

-- 2. Agendas importés par lien .ics (Google, Outlook, calendrier public iCloud), lus par la fonction agenda-synchro.
create table if not exists public.agenda_abonnements (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  nom text not null default 'Agenda' check (char_length(nom) between 1 and 80),
  url text not null check (url ~ '^https?://'),
  member_id uuid references public.foyer_membres(id) on delete set null,   -- « pour qui » (vide = toute la famille)
  actif boolean not null default true,
  nb int,
  maj_le timestamptz,
  erreur text,
  created_at timestamptz not null default now()
);
alter table public.agenda_abonnements enable row level security;
drop policy if exists "foyer" on public.agenda_abonnements;
create policy "foyer" on public.agenda_abonnements for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));
create index if not exists agenda_abonnements_foyer on public.agenda_abonnements (foyer_id);

-- 3. iCloud (CalDAV) : état lisible par le foyer, écrit uniquement par la fonction (clé de service).
create table if not exists public.agenda_caldav (
  foyer_id uuid primary key references public.foyers(id) on delete cascade,
  user_id uuid,                                        -- compte qui a relié iCloud
  compte text,                                         -- identifiant Apple masqué (an…@icloud.com)
  dossier_url text,
  calendriers jsonb not null default '[]',             -- [{ url, nom, couleur, ctag }]
  calendrier_url text,
  calendrier_nom text,
  statut text not null default 'choix' check (statut in ('choix', 'ok', 'erreur')),
  erreur text,
  dernier_synchro timestamptz,
  stats jsonb,
  updated_at timestamptz not null default now()
);
alter table public.agenda_caldav enable row level security;
drop policy if exists "foyer" on public.agenda_caldav;
create policy "foyer" on public.agenda_caldav for select to authenticated using (foyer_id = (select mon_foyer()));

-- Identifiant Apple et mot de passe d'application, chiffrés (AES-GCM) par la fonction : AUCUNE politique, donc
-- illisibles depuis l'appli ; seule la clé de service y accède.
create table if not exists public.agenda_caldav_secrets (
  foyer_id uuid primary key references public.foyers(id) on delete cascade,
  data text not null,
  updated_at timestamptz not null default now()
);
alter table public.agenda_caldav_secrets enable row level security;

-- Correspondance ressource iCloud ↔ événements de l'agenda (état de la dernière synchro) : fonction uniquement.
create table if not exists public.agenda_caldav_liens (
  foyer_id uuid not null references public.foyers(id) on delete cascade,
  href text not null,
  etag text,
  uid text,
  evenement_ids uuid[] not null default '{}',
  empreinte text,
  brut text,
  synchro_le timestamptz,
  primary key (foyer_id, href)
);
alter table public.agenda_caldav_liens enable row level security;

-- 4. Clé partagée entre pg_cron et la fonction, et synchro iCloud automatique toutes les heures (à :37).
insert into public.config_app (key, value) values ('agenda_cron_key', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (key) do nothing;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'agenda-synchro';
    perform cron.schedule('agenda-synchro', '37 * * * *', $cron$
      select net.http_post(
        url := 'https://svugddkrptqpjmywhorb.supabase.co/functions/v1/agenda-synchro',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dWdkZGtycHRxcGpteXdob3JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MjU5NDgsImV4cCI6MjEwODUwMTk0OH0.63RETgf7rbVMquGV-7ooY3qn-Qf31uVCA3ZBfqBvFcI', 'x-cron-key', (select value from public.config_app where key = 'agenda_cron_key')),
        timeout_milliseconds := 120000,
        body := '{"action":"cron"}'::jsonb)
    $cron$);
  end if;
end $$;

-- ============================================================================
-- taches (2026-11-16_taches.sql)
-- ============================================================================
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

-- ============================================================================
-- carnet (2026-11-16_carnet.sql)
-- ============================================================================
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

-- ============================================================================
-- cuisine-mc (2026-11-16_cuisine-mc.sql)
-- ============================================================================
-- Tribu & Toutous : module « Cuisine reliée à Monsieur Cuisine » (cuisine-mc).
-- Idempotente : peut être rejouée sans risque. Aucune donnée existante n'est modifiée.
--
-- courses_modifs : surcharges de la liste de courses, partagées dans le foyer, appliquées par-dessus chaque
-- synchronisation Monsieur Cuisine (qui efface et réécrit mc_courses toutes les heures). Une ligne par article,
-- repéré par sa clé (nom normalisé) : nom, quantité, unité, précision (bio, marque, calibre), rayon, masqué,
-- « racheter même si au placard », et la coche du magasin (partagée en direct entre les téléphones).

create table if not exists public.courses_modifs (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  cle text not null check (length(cle) between 1 and 200),
  nom text check (nom is null or length(nom) <= 120),
  quantite text check (quantite is null or length(quantite) <= 40),
  unite text check (unite is null or length(unite) <= 40),
  precision text check (precision is null or length(precision) <= 120),
  rayon text check (rayon is null or length(rayon) <= 60),
  masque boolean not null default false,
  forcer boolean not null default false,
  coche boolean not null default false,
  coche_le timestamptz,
  coche_par uuid,
  updated_at timestamptz not null default now(),
  unique (foyer_id, cle)
);
alter table public.courses_modifs enable row level security;
drop policy if exists "foyer" on public.courses_modifs;
create policy "foyer" on public.courses_modifs for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));

-- Cochage partagé en direct : courses_modifs et courses_ajouts dans la publication temps réel de Supabase
-- (les événements respectent la sécurité RLS : chaque foyer ne reçoit que les siens).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'courses_modifs') then
      alter publication supabase_realtime add table public.courses_modifs;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'courses_ajouts') then
      alter publication supabase_realtime add table public.courses_ajouts;
    end if;
  end if;
end $$;

-- ============================================================================
-- messages-photos (2026-11-16_messages-photos.sql)
-- ============================================================================
-- Tribu & Toutous : module « Messages et photos » (discussion de la famille, album privé, gazette mensuelle).
-- Idempotente : peut être rejouée sans risque. Aucune donnée existante n'est supprimée.
-- Confidentialité : tout est réservé au foyer (foyer_id = mon_foyer()). Un message ne peut être modifié
-- ou supprimé que par son auteur ; l'album, les albums et la gazette sont partagés par les adultes du foyer.
-- Fichiers : bucket privé « famille » (adresses signées), chemins <foyer_id>/<dossier>/<id>.jpg.

-- 1. Discussion de la famille
create table if not exists public.messages_famille (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  auteur text,                      -- prénom au moment de l'envoi (affichage et notification)
  texte text check (texte is null or char_length(texte) <= 2000),
  photo jsonb,                      -- { chemin, mini, l, h }
  created_at timestamptz not null default now(),
  check (texte is not null or photo is not null)
);
create index if not exists messages_famille_foyer_date on public.messages_famille (foyer_id, created_at desc);

create table if not exists public.messages_reactions (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  message_id uuid not null references public.messages_famille(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists messages_reactions_foyer_date on public.messages_reactions (foyer_id, created_at);

-- Lu / non lu : un repère par compte (dernier message vu).
create table if not exists public.messages_lus (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid() unique,
  lu_jusqu_a timestamptz not null default now()
);

-- 2. Album de famille
create table if not exists public.photos_albums (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  titre text not null check (char_length(titre) between 1 and 80),
  description text,
  lien text check (lien is null or lien ~ '^https://'),  -- album Google Photos ou iCloud partagé
  couverture uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.photos_famille (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  auteur text,
  album_id uuid references public.photos_albums(id) on delete set null,
  chemin text not null,             -- grande image (~1600 px, ~300 Ko)
  miniature text,                   -- miniature (~480 px)
  largeur int, hauteur int, poids int,
  legende text check (legende is null or char_length(legende) <= 200),
  prise_le date,
  membres uuid[] not null default '{}',  -- qui est sur la photo (foyer_membres)
  created_at timestamptz not null default now()
);
create index if not exists photos_famille_foyer_date on public.photos_famille (foyer_id, prise_le desc, created_at desc);
create index if not exists photos_famille_album on public.photos_famille (album_id);

-- 3. Gazette des grands-parents : une par mois et par foyer
create table if not exists public.photos_gazettes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  mois text not null check (mois ~ '^\d{4}-\d{2}$'),
  titre text not null default 'La Gazette de la Tribu',
  mot text,
  nouvelles text,
  photos uuid[] not null default '{}',
  imprimee_le date,
  updated_at timestamptz not null default now(),
  unique (foyer_id, mois)
);

-- 4. Règles d'accès (RLS)
alter table public.messages_famille enable row level security;
alter table public.messages_reactions enable row level security;
alter table public.messages_lus enable row level security;
alter table public.photos_albums enable row level security;
alter table public.photos_famille enable row level security;
alter table public.photos_gazettes enable row level security;

do $$
declare t text;
begin
  -- Lecture par tout le foyer ; écriture par l'auteur seulement (messages, réactions, repère de lecture).
  foreach t in array array['messages_famille', 'messages_reactions', 'messages_lus'] loop
    execute format('drop policy if exists "foyer_lecture" on public.%I', t);
    execute format('create policy "foyer_lecture" on public.%I for select to authenticated using (foyer_id = (select mon_foyer()))', t);
    execute format('drop policy if exists "auteur_ajout" on public.%I', t);
    execute format('create policy "auteur_ajout" on public.%I for insert to authenticated with check (foyer_id = (select mon_foyer()) and user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "auteur_modif" on public.%I', t);
    execute format('create policy "auteur_modif" on public.%I for update to authenticated using (foyer_id = (select mon_foyer()) and user_id = (select auth.uid())) with check (foyer_id = (select mon_foyer()) and user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "auteur_suppr" on public.%I', t);
    execute format('create policy "auteur_suppr" on public.%I for delete to authenticated using (foyer_id = (select mon_foyer()) and user_id = (select auth.uid()))', t);
  end loop;
  -- Album, albums et gazette : partagés par le foyer.
  foreach t in array array['photos_albums', 'photos_famille', 'photos_gazettes'] loop
    execute format('drop policy if exists "foyer" on public.%I', t);
    execute format('create policy "foyer" on public.%I for all to authenticated using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()))', t);
  end loop;
end $$;

-- 5. Temps réel : la discussion arrive sans recharger (les suppressions portent foyer_id grâce à replica identity full).
alter table public.messages_famille replica identity full;
alter table public.messages_reactions replica identity full;
alter table public.messages_lus replica identity full;
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages_famille', 'messages_reactions', 'messages_lus'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- 6. Fichiers : bucket privé « famille » (5 Mo au plus par fichier, images seulement).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('famille', 'famille', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Le premier dossier du chemin est l'identifiant du foyer : chacun n'atteint que les fichiers de son foyer.
drop policy if exists "famille_lecture" on storage.objects;
create policy "famille_lecture" on storage.objects for select to authenticated
  using (bucket_id = 'famille' and (storage.foldername(name))[1] = (select mon_foyer())::text);
drop policy if exists "famille_ajout" on storage.objects;
create policy "famille_ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'famille' and (storage.foldername(name))[1] = (select mon_foyer())::text);
drop policy if exists "famille_modif" on storage.objects;
create policy "famille_modif" on storage.objects for update to authenticated
  using (bucket_id = 'famille' and (storage.foldername(name))[1] = (select mon_foyer())::text)
  with check (bucket_id = 'famille' and (storage.foldername(name))[1] = (select mon_foyer())::text);
drop policy if exists "famille_suppr" on storage.objects;
create policy "famille_suppr" on storage.objects for delete to authenticated
  using (bucket_id = 'famille' and (storage.foldername(name))[1] = (select mon_foyer())::text);

-- 7. Notifications : la fonction messages-notifier (supabase/functions/messages-notifier) est appelée par l'appli
-- après chaque envoi ; elle évite les doublons grâce à rappels_envoyes (type 'message' ou 'photo').

-- ============================================================================
-- accueil-notifications (2026-11-16_accueil-notifications.sql)
-- ============================================================================
-- Tribu & Toutous : Accueil et notifications (réglages par personne, file des notifications à envoyer).
-- Idempotente. Aucune donnée existante n'est modifiée. À coller dans l'éditeur SQL de Supabase.
-- La fonction send-reminders (nouvelle version) lit ces tables avec la clé de service ; sans elles,
-- elle continue d'utiliser push_abonnements.prefs comme avant.

-- 1) Réglages de notifications : une ligne par compte, visible et modifiable par son seul propriétaire.
--    types : { "briefing": true, "agenda_modifs": false, … } (un interrupteur par type ; absent = valeur par défaut).
create table if not exists public.notif_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  foyer_id uuid default mon_foyer() references public.foyers(id) on delete cascade,
  types jsonb not null default '{}',
  silence_actif boolean not null default true,
  silence_debut smallint not null default 22 check (silence_debut between 0 and 23),
  silence_fin smallint not null default 7 check (silence_fin between 0 and 23),
  briefing_heure smallint not null default 19 check (briefing_heure between 0 and 23),
  rappel_min integer not null default 60 check (rappel_min between 0 and 1440),
  regrouper boolean not null default true,
  courses_day smallint check (courses_day between 0 and 6),
  courses_hour smallint check (courses_hour between 0 and 23),
  updated_at timestamptz not null default now()
);
alter table public.notif_prefs enable row level security;
drop policy if exists "proprietaire" on public.notif_prefs;
create policy "proprietaire" on public.notif_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 2) File des notifications à envoyer (briefing préparé par l'appli, rappels d'événements, tâches, messages…).
--    Les modules de l'appli y déposent une ligne ; send-reminders l'envoie à l'heure prévue (envoyer_a),
--    à chaque destinataire selon ses réglages et ses heures de silence (une notification retenue par le silence
--    part à la fin du silence, sauf si elle a expiré).
--    Destinataires : pour_users (comptes) et/ou pour_membres (membres du foyer, reliés aux comptes par foyer_comptes) ;
--    les deux vides = tout le foyer. sauf_auteur : l'auteur ne reçoit pas sa propre modification.
--    evenement_a : heure d'un événement ; le rappel part alors rappel_min (réglage de chacun) avant.
create table if not exists public.notif_file (
  id text primary key,
  foyer_id uuid not null default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid default auth.uid(),
  type text not null,
  titre text not null,
  corps text not null default '',
  url text,
  pour_users uuid[],
  pour_membres uuid[],
  sauf_auteur boolean not null default false,
  envoyer_a timestamptz not null default now(),
  evenement_a timestamptz,
  expire_a timestamptz,
  envoye_le timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notif_file_a_envoyer on public.notif_file (envoyer_a) where envoye_le is null;
create index if not exists notif_file_foyer on public.notif_file (foyer_id, type);
alter table public.notif_file enable row level security;
drop policy if exists "foyer" on public.notif_file;
create policy "foyer" on public.notif_file for all to authenticated
  using (foyer_id = (select mon_foyer())) with check (foyer_id = (select mon_foyer()));

-- 3) Envois déjà faits : la table rappels_envoyes existante (clé primaire foyer_id, type, key) sert aussi
--    à la file, avec la clé « file:<id>:<compte> » : une seule fois par destinataire. Rien à changer.

-- 4) Ménage : les lignes envoyées ou expirées depuis plus de 30 jours sont supprimées chaque nuit (si pg_cron est actif).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'notif-file-menage';
    perform cron.schedule('notif-file-menage', '41 3 * * *',
      $q$delete from public.notif_file where coalesce(envoye_le, expire_a, envoyer_a) < now() - interval '30 days'$q$);
  end if;
end $$;

-- ============================================================================
-- univers-securite (2026-11-16_univers-securite.sql)
-- ============================================================================
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
