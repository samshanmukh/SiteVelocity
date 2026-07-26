-- Immutable application read models used while normalized domain records remain
-- the analytical source of truth. Projections let the UI read one validated
-- aggregate without leaking storage types into application components.

create table public.domain_projections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  projection_kind text not null
    check (projection_kind in ('candidate_set', 'snapshot_bundle', 'raw_source_page')),
  scope_key text not null check (length(btrim(scope_key)) between 1 and 500),
  version_key text not null check (length(btrim(version_key)) between 1 and 500),
  status text not null check (status in ('complete', 'partial')),
  source_cutoff_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  content_checksum text not null check (content_checksum ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, projection_kind, scope_key, version_key),
  unique (organization_id, projection_kind, scope_key, content_checksum)
);

create index domain_projections_latest_idx
  on public.domain_projections (
    organization_id,
    projection_kind,
    scope_key,
    status,
    source_cutoff_at desc,
    created_at desc
  );

alter table public.domain_projections enable row level security;

create policy domain_projections_member_read
on public.domain_projections for select to authenticated
using (public.is_organization_member(organization_id));

revoke all on table public.domain_projections from public, anon, authenticated;
grant select on table public.domain_projections to authenticated;
grant select, insert on table public.domain_projections to service_role;

create trigger domain_projections_immutable
before update or delete on public.domain_projections
for each row execute function public.reject_immutable_change();
