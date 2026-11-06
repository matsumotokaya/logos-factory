-- ============================================================================
-- 0061 - organizations.main_brand_id: the workspace's main brand, explicit
--
-- A workspace has one main brand — its face. It used to be derived (a brand
-- another brand inherits from), which meant a workspace with one brand, or
-- two unrelated ones, showed no main at all (2026-11-06). Now it is a column:
-- the first brand registered becomes the main, 「メインブランドにする」 moves
-- it, and deleting the main hands it to the next brand in the list.
--
-- parent_brand_id is unchanged: a sub-brand points at the brand it sits
-- under, usually but not necessarily the main.
-- ============================================================================

alter table public.organizations
  add column main_brand_id uuid references public.brand_entities(id) on delete set null;

-- Backfill: the first brand in each workspace's list.
update public.organizations o
set main_brand_id = (
  select b.id from public.brand_entities b
  where b.organization_id = o.org_id
  order by b.sort_order, b.created_at, b.id
  limit 1
)
where main_brand_id is null;

create index organizations_main_brand_idx on public.organizations (main_brand_id);

comment on column public.organizations.main_brand_id is
  'The workspace''s main brand (one). Set on first brand, moved by set_main_brand, handed on when the main is deleted.';

-- The first brand of a workspace is its main.
create or replace function private.adopt_first_brand_as_main()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organizations
  set main_brand_id = new.id
  where org_id = new.organization_id and main_brand_id is null;
  return new;
end;
$$;

drop trigger if exists brand_entities_first_is_main on public.brand_entities;
create trigger brand_entities_first_is_main
  after insert on public.brand_entities
  for each row execute function private.adopt_first_brand_as_main();

-- Deleting the main hands it to the next brand in the list, so a workspace
-- with brands never has no main.
create or replace function private.hand_on_main_brand()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organizations o
  set main_brand_id = (
    select b.id from public.brand_entities b
    where b.organization_id = old.organization_id and b.id <> old.id
    order by b.sort_order, b.created_at, b.id
    limit 1
  )
  where o.org_id = old.organization_id and o.main_brand_id = old.id;
  return old;
end;
$$;

drop trigger if exists brand_entities_hand_on_main on public.brand_entities;
create trigger brand_entities_hand_on_main
  before delete on public.brand_entities
  for each row execute function private.hand_on_main_brand();

-- 「メインブランドにする」. Anyone who can edit the brand's core can make it
-- the main; organizations has no user update policy, so this is the one door.
create or replace function public.set_main_brand(p_brand_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.brand_entities where id = p_brand_id;
  if v_org is null then
    raise exception 'BRAND_NOT_FOUND';
  end if;
  if not private.can_edit_brand_core(p_brand_id) then
    raise exception 'MAIN_BRAND_FORBIDDEN';
  end if;
  update public.organizations set main_brand_id = p_brand_id where org_id = v_org;
end;
$$;

revoke all on function public.set_main_brand(uuid) from public, anon;
grant execute on function public.set_main_brand(uuid) to authenticated;
