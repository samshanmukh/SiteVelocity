-- Immutable landing zone for batches delivered by Nexla or another managed
-- ingestion provider. Normalization consumes these records without rewriting
-- the received payload, preserving a defensible raw-data audit trail.

create table public.managed_ingestion_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider text not null check (provider in ('nexla')),
  dataset_key text not null check (dataset_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  external_batch_id text not null check (length(btrim(external_batch_id)) between 1 and 255),
  source_uri text not null check (source_uri ~ '^https://'),
  retrieved_at timestamptz not null,
  record_count integer not null check (record_count between 1 and 1000),
  payload_checksum text not null check (payload_checksum ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  unique (organization_id, provider, dataset_key, external_batch_id)
);

create index managed_ingestion_batches_latest_idx
  on public.managed_ingestion_batches (
    organization_id,
    provider,
    dataset_key,
    retrieved_at desc,
    created_at desc
  );

create trigger managed_ingestion_batches_immutable
before update or delete on public.managed_ingestion_batches
for each row execute function public.reject_immutable_change();

alter table public.managed_ingestion_batches enable row level security;

create policy managed_ingestion_batches_member_read
on public.managed_ingestion_batches for select to authenticated
using (public.is_organization_member(organization_id));

revoke all on table public.managed_ingestion_batches from anon, authenticated;
grant select on table public.managed_ingestion_batches to authenticated;
grant all on table public.managed_ingestion_batches to service_role;
