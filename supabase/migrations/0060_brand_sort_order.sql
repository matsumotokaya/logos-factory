-- ============================================================================
-- 0060 - brand_entities.sort_order: the user's own order of brands
--
-- Brands sit flat under their workspace (docs/product.md §2.1, 2026-11-05):
-- parent_brand_id says what a brand INHERITS FROM, not what folder it is in.
-- The order they are listed in is the user's to arrange — the main brand at
-- the top, sub-brands where they read best — so it is stored, not derived.
--
-- Backfilled by creation time within each workspace so nothing moves on the
-- day this lands. New brands get the next number (createBrandFromUrl).
-- ============================================================================

alter table public.brand_entities
  add column sort_order integer not null default 0;

with ranked as (
  select id,
         row_number() over (partition by organization_id order by created_at, id) as n
  from public.brand_entities
)
update public.brand_entities b
set sort_order = ranked.n
from ranked
where ranked.id = b.id;

create index brand_entities_org_sort_idx
  on public.brand_entities (organization_id, sort_order);

comment on column public.brand_entities.sort_order is
  'Position in the workspace''s brand list, chosen by the user. parent_brand_id is inheritance, not placement.';
