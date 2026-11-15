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
--    Le briefing du soir est personnel (il contient les séances de sport prévues, même non partagées) : seule la
--    personne qui l'a préparé le lit ou le modifie. Les autres lignes (rappels, tâches, modifications) restent
--    communes au foyer : chaque appli les programme sous le même identifiant pour n'envoyer qu'une fois.
drop policy if exists "foyer" on public.notif_file;
create policy "foyer" on public.notif_file for all to authenticated
  using (foyer_id = (select mon_foyer()) and (type <> 'briefing' or user_id = (select auth.uid())))
  with check (foyer_id = (select mon_foyer()) and (type <> 'briefing' or user_id = (select auth.uid())));

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
