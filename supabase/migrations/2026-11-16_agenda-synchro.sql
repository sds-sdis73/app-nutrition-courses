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
