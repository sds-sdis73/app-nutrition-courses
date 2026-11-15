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
