-- Tribu & Toutous : protection de la table foyer_comptes, sur laquelle reposent toutes les règles « foyer_id = mon_foyer() ».
-- Idempotente : peut être rejouée sans risque. Aucune donnée existante n'est modifiée.
-- Avant : un compte pouvait s'ajouter lui-même à n'importe quel foyer dont il connaissait l'identifiant (INSERT sans
-- contrôle du foyer ni du rôle), ou se promouvoir administrateur, ou changer de membre relié (UPDATE sans WITH CHECK).
-- Après :
--   - INSERT direct : seulement la toute première ligne d'un foyer que l'on vient de créer soi-même (création du foyer
--     au premier passage dans l'appli). Rejoindre un foyer existant passe par la fonction join-foyer (code d'invitation,
--     clé de service), que ces règles ne concernent pas.
--   - UPDATE : foyer_id et user_id ne changent jamais ; role ne change que par un administrateur du foyer ; member_id
--     (« Je suis… ») : un membre du même foyer, jamais déjà relié à un autre compte ; un simple membre ne le choisit
--     qu'une fois (première liaison), un administrateur peut le corriger.
--   - Un membre du foyer n'est relié qu'à un seul compte ; un compte n'appartient qu'à un seul foyer (index uniques).

-- 1. Fonctions d'aide (security definer : lisent foyer_comptes et foyers sans passer par leurs propres règles)
create or replace function public.foyer_neuf(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.foyers f where f.id = fid and f.created_by = auth.uid())
     and not exists (select 1 from public.foyer_comptes c where c.foyer_id = fid)
$$;
revoke all on function public.foyer_neuf(uuid) from public, anon;
grant execute on function public.foyer_neuf(uuid) to authenticated;

create or replace function public.foyer_comptes_garde()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  appelant uuid := auth.uid();
  admin boolean;
begin
  -- Fonctions du serveur (clé de service) et accès direct à la base : pas de contrôle.
  if appelant is null or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  admin := exists (select 1 from public.foyer_comptes c where c.user_id = appelant and c.foyer_id = old.foyer_id and c.role = 'admin');
  if new.user_id is distinct from old.user_id or new.foyer_id is distinct from old.foyer_id then
    raise exception 'On ne change de foyer qu''avec un code d''invitation.' using errcode = '42501';
  end if;
  if new.role is distinct from old.role then
    if not admin then raise exception 'Seul un administrateur du foyer peut changer le rôle d''un compte.' using errcode = '42501'; end if;
    if new.role not in ('admin', 'membre') then raise exception 'Rôle inconnu.' using errcode = '22023'; end if;
  end if;
  if new.member_id is distinct from old.member_id then
    if not admin and old.member_id is not null then
      raise exception 'Seul un administrateur du foyer peut changer la personne reliée à un compte.' using errcode = '42501';
    end if;
    if new.member_id is not null and not exists (select 1 from public.foyer_membres m where m.id = new.member_id and m.foyer_id = old.foyer_id) then
      raise exception 'Ce membre n''appartient pas au foyer.' using errcode = '42501';
    end if;
    if new.member_id is not null and exists (select 1 from public.foyer_comptes c where c.member_id = new.member_id and c.user_id <> old.user_id) then
      raise exception 'Ce membre est déjà relié à un autre compte.' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.foyer_comptes_garde() from public, anon, authenticated;

drop trigger if exists foyer_comptes_garde on public.foyer_comptes;
create trigger foyer_comptes_garde before update on public.foyer_comptes for each row execute function public.foyer_comptes_garde();

-- 2. Règles d'accès
alter table public.foyer_comptes enable row level security;
drop policy if exists "comptes_creation" on public.foyer_comptes;
create policy "comptes_creation" on public.foyer_comptes for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'admin' and member_id is null and public.foyer_neuf(foyer_id));
drop policy if exists "comptes_modif" on public.foyer_comptes;
create policy "comptes_modif" on public.foyer_comptes for update to authenticated
  using (user_id = (select auth.uid()) or (foyer_id = (select mon_foyer()) and (select est_admin_foyer())))
  with check (user_id = (select auth.uid()) or (foyer_id = (select mon_foyer()) and (select est_admin_foyer())));

-- 3. Unicité : un compte, un foyer ; un membre, un compte au plus.
create unique index if not exists foyer_comptes_user_idx on public.foyer_comptes (user_id);
create unique index if not exists foyer_comptes_membre_idx on public.foyer_comptes (member_id) where member_id is not null;

-- 4. Pas d'accès anonyme.
revoke all on public.foyer_comptes from anon;
