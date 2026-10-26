-- ============================================================================
-- 0059 - brand_runs: a brand's own runs, with their log, in the database
--
-- Reading a brand's site (on creation, and again on demand) takes a minute
-- and runs detached. Its progress lived in local JSON files — CM Maker's job
-- store (var/campaign-lab/jobs) for creation, and a second store for
-- re-import — which a container restart erases and other instances never
-- see. A deliverable already keeps its runs in take_runs; this is the same
-- record for work done on the brand itself.
--
--   kind    'import'  read the site into the brand (creation and re-import)
--   steps   the log, one {ts, message, level} per line, as the page shows it
--   result  what the run produced (counts), for the closing notice
--
-- Rights follow the brand core rung: reading a site writes brand knowledge.
--
-- Also drops take_runs.external_job_id, the bridge to CM Maker's job store,
-- which goes with it.
-- ============================================================================

create table public.brand_runs (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brand_entities(id) on delete cascade,
  kind        text not null check (kind in ('import')),
  status      text not null default 'running' check (status in ('running', 'done', 'error')),
  steps       jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  result      jsonb,
  error       text,
  created_by  uuid references public.users(user_id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.brand_runs enable row level security;

create index brand_runs_brand_created_idx on public.brand_runs (brand_id, created_at desc);

comment on table public.brand_runs is
  'Runs on a brand itself (reading its site), with their step log. take_runs is the same record for a deliverable.';

create policy brand_runs_select on public.brand_runs
  for select to authenticated
  using (private.is_registered_user() and private.can_edit_brand_core(brand_id));

create policy brand_runs_insert on public.brand_runs
  for insert to authenticated
  with check (
    private.is_registered_user()
    and private.can_edit_brand_core(brand_id)
    and (created_by is null or created_by = auth.uid())
  );

create policy brand_runs_update on public.brand_runs
  for update to authenticated
  using (private.is_registered_user() and private.can_edit_brand_core(brand_id))
  with check (private.is_registered_user() and private.can_edit_brand_core(brand_id));

grant select, insert, update on public.brand_runs to authenticated;

alter table public.take_runs drop column if exists external_job_id;
