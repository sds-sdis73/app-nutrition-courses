-- Miam & moi : liaison avec Monsieur Cuisine (compte Lidl), lecture seule MC → Miam.
-- Idempotente. Aucune donnée existante n'est modifiée.

-- État de la liaison, visible de tout le foyer (une liaison par foyer).
create table if not exists public.mc_connexions (
  foyer_id uuid primary key default mon_foyer() references public.foyers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  statut text not null default 'attente' check (statut in ('attente','ok','erreur','deconnecte')),
  compte text,
  derniere_synchro timestamptz,
  erreur text,
  stats jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.mc_connexions enable row level security;
drop policy if exists "foyer" on public.mc_connexions;
create policy "foyer" on public.mc_connexions for select to authenticated using (foyer_id = (select mon_foyer()));

-- Jetons chiffrés (AES-GCM, clé dans les secrets de la fonction) : AUCUNE politique, donc illisibles depuis l'appli.
create table if not exists public.mc_secrets (
  foyer_id uuid primary key references public.foyers(id) on delete cascade,
  data text not null,
  updated_at timestamptz not null default now()
);
alter table public.mc_secrets enable row level security;

-- Copies des données Monsieur Cuisine (écrites par la fonction, lues par le foyer).
create table if not exists public.mc_planning (
  foyer_id uuid not null references public.foyers(id) on delete cascade,
  mc_id text not null,
  date date not null,
  recette_mc_id bigint,
  titre text not null,
  portions numeric,
  duree_min int,
  image text,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (foyer_id, mc_id)
);
create index if not exists mc_planning_date on public.mc_planning (foyer_id, date);

create table if not exists public.mc_courses (
  foyer_id uuid not null references public.foyers(id) on delete cascade,
  mc_id text not null,
  nom text not null,
  quantite text,
  unite text,
  rayon text,
  rayon_ordre int,
  coche boolean not null default false,
  recette text,
  updated_at timestamptz not null default now(),
  primary key (foyer_id, mc_id)
);

create table if not exists public.mc_recettes (
  foyer_id uuid not null references public.foyers(id) on delete cascade,
  mc_id bigint not null,
  titre text not null,
  perso boolean not null default false,
  favori boolean not null default false,
  portions numeric,
  unite_portion text,
  duree_min int,
  preparation_min int,
  image text,
  ingredients jsonb not null default '[]',
  etapes jsonb not null default '[]',
  nutriments jsonb,
  brut jsonb,
  updated_at timestamptz not null default now(),
  primary key (foyer_id, mc_id)
);

do $$
declare t text;
begin
  foreach t in array array['mc_planning','mc_courses','mc_recettes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "foyer" on public.%I', t);
    execute format('create policy "foyer" on public.%I for select to authenticated using (foyer_id = (select mon_foyer()))', t);
  end loop;
end $$;

-- Clé partagée entre pg_cron et la fonction, pour que seule la tâche planifiée puisse lancer la synchro de tous les foyers.
insert into public.config_app (key, value) values ('mc_cron_key', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (key) do nothing;

-- Synchronisation automatique toutes les heures (à :17) par pg_cron + pg_net, comme send-reminders (clé publique « anon » de l'appli).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'monsieur-cuisine-synchro';
    perform cron.schedule('monsieur-cuisine-synchro', '17 * * * *', $cron$
      select net.http_post(
        url := 'https://svugddkrptqpjmywhorb.supabase.co/functions/v1/monsieur-cuisine',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dWdkZGtycHRxcGpteXdob3JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MjU5NDgsImV4cCI6MjEwODUwMTk0OH0.63RETgf7rbVMquGV-7ooY3qn-Qf31uVCA3ZBfqBvFcI', 'x-cron-key', (select value from public.config_app where key = 'mc_cron_key')),
        timeout_milliseconds := 120000,
        body := '{"action":"cron"}'::jsonb)
    $cron$);
  end if;
end $$;
