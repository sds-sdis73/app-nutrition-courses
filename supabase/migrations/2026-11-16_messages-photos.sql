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
