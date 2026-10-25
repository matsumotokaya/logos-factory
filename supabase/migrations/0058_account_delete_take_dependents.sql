-- ============================================================================
-- 0058 - account deletion clears what points at a take before the take
--
-- delete_user_account removed takes first and let everything hanging off them
-- cascade. Two tables refuse instead of cascading:
--
--   canonical_slots.take_id   ON DELETE RESTRICT  (a slot names the take it shows)
--   publications.render_id    ON DELETE RESTRICT  (a URL names the render it serves)
--
-- So any account whose workspace held a logo presentation in a canonical slot
-- could not be deleted: the RPC raised a foreign-key violation and the settings
-- page said only 「アカウント処理に失敗しました」. Account deletion is total —
-- the slots and publications die with the workspace — so they go first.
--
-- The function is 0056's, unchanged except for the two deletes marked below.
-- ============================================================================

create or replace function public.delete_user_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  preview jsonb;
  deleted_org_ids uuid[] := '{}'::uuid[];
  deleted_brand_ids uuid[] := '{}'::uuid[];
  object_keys text[] := '{}'::text[];
  current_deletion_id uuid := gen_random_uuid();
begin
  preview := public.account_deletion_preview(p_user_id);
  if jsonb_array_length(preview -> 'blockingOrganizations') > 0 then
    raise exception 'ACCOUNT_DELETE_BLOCKED_LAST_ORG_OWNER'
      using errcode = '23514', detail = (preview -> 'blockingOrganizations')::text;
  end if;

  select coalesce(array_agg(m.org_id), '{}'::uuid[])
  into deleted_org_ids
  from public.org_members m
  where m.user_id = p_user_id
    and not exists (
      select 1 from public.org_members other
      where other.org_id = m.org_id and other.user_id <> p_user_id
    );

  deleted_brand_ids := private.account_deleted_brand_ids(p_user_id, deleted_org_ids);

  select coalesce(array_agg(object_key order by object_key), '{}'::text[])
  into object_keys
  from (
    select m.image_path as object_key
    from public.logo_mockups m
    join public.logo_candidates c on c.id = m.candidate_id
    join public.logos l on l.id = c.logo_id
    where (l.owner_user_id = p_user_id or l.owner_org_id = any(deleted_org_ids))
      and m.image_path like ('logos/' || l.id || '/candidates/' || c.id::text || '/mockups/%')
    union
    select r.output_path
    from public.logo_asset_runs r
    join public.logo_candidates c on c.id = r.candidate_id
    join public.logos l on l.id = c.logo_id
    where r.output_path is not null
      and (l.owner_user_id = p_user_id or l.owner_org_id = any(deleted_org_ids))
      and r.output_path like ('logos/' || l.id || '/candidates/' || c.id::text || '/mockups/%')
    union
    select material.r2_key
    from public.brand_materials material
    where material.brand_id = any(deleted_brand_ids) and material.r2_key is not null
    union
    select artifact.r2_key
    from public.render_artifacts artifact
    join public.take_renders render on render.id = artifact.render_id
    join public.takes take on take.id = render.take_id
    where take.brand_id = any(deleted_brand_ids)
  ) paths
  where object_key is not null and object_key <> '';

  insert into private.r2_deletion_queue (deletion_id, object_key, user_id)
  select current_deletion_id, object_key, p_user_id
  from unnest(object_keys) as object_key
  on conflict do nothing;

  -- 0058: both reference a take (or its render) with ON DELETE RESTRICT.
  delete from public.canonical_slots
  where take_id in (select take.id from public.takes take where take.brand_id = any(deleted_brand_ids));
  delete from public.publications
  where render_id in (
    select render.id
    from public.take_renders render
    join public.takes take on take.id = render.take_id
    where take.brand_id = any(deleted_brand_ids)
  );

  delete from public.takes where brand_id = any(deleted_brand_ids);
  delete from public.brand_materials where brand_id = any(deleted_brand_ids);

  delete from public.logos
  where owner_user_id = p_user_id
     or owner_org_id = any(deleted_org_ids);

  delete from public.logo_transfer_requests
  where proposed_owner_user_id = p_user_id
     or source_owner_user_id = p_user_id;

  -- Brands in the dying workspaces go before the workspaces themselves
  -- (organization_id is ON DELETE RESTRICT by design).
  delete from public.brand_entities where organization_id = any(deleted_org_ids);
  delete from public.organizations where org_id = any(deleted_org_ids);

  delete from public.users where user_id = p_user_id;
  delete from auth.users where id = p_user_id;

  return jsonb_build_object(
    'deletionId', current_deletion_id,
    'objectKeys', to_jsonb(object_keys),
    'preview', preview
  );
end;
$$;
