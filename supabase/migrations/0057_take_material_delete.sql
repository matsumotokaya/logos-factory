-- ============================================================================
-- 0057 - a video's own material is the video editor's to delete
--
-- Design: docs/asset-normalization.md §9.4
--
-- 0028 granted DELETE on brand_materials to the core rung only, which is right
-- for the brand library: the mark every deliverable draws from must not be
-- removable by whoever can edit one video. It is wrong for scope='take'. A
-- flyer uploaded to one video by the person editing that video is that video's
-- material, and until now they could not take it back — the row stayed in the
-- inventory for ever, and the only way to remove a mistaken upload was to
-- delete the whole video.
--
-- So the delete splits along the same seam the insert already uses (0028's
-- brand_materials_insert asks for core to create a scope='brand' row and output
-- for anything narrower). Two permissive policies, ORed by PostgreSQL:
--
--   brand_materials_delete       core rung, any scope     (unchanged)
--   brand_materials_delete_take  output rung, scope='take'  (new)
--
-- Nothing here weakens the brand library, and nothing here makes a delete
-- reachable while a take still depends on the row: take_inputs.material_id is
-- ON DELETE RESTRICT (0028), so the pins have to be released first, and the
-- API refuses when another take is holding the same file.
-- ============================================================================

drop policy if exists brand_materials_delete_take on public.brand_materials;
create policy brand_materials_delete_take on public.brand_materials
  for delete to authenticated
  using (
    private.is_registered_user()
    and scope = 'take'
    and private.can_edit_brand_output(brand_id)
  );

comment on policy brand_materials_delete_take on public.brand_materials is
  'A take-scope material belongs to one deliverable, so the rung that may edit that deliverable may also delete it. The brand library still requires core (brand_materials_delete).';
