-- Scout preferences remain advisory application state, separate from property
-- evidence. Each revision is an immutable tenant projection; Mem0 is an
-- optional retrieval layer and never becomes the property system of record.

alter table public.domain_projections
  drop constraint domain_projections_projection_kind_check;

alter table public.domain_projections
  add constraint domain_projections_projection_kind_check
  check (projection_kind in ('candidate_set', 'snapshot_bundle', 'raw_source_page', 'scout_preferences'));
