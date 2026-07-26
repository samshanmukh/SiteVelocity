-- SiteVelocity Alpha database foundation.
-- All tenant-owned rows carry organization_id so RLS can be explicit and auditable.

create extension if not exists pgcrypto with schema extensions;

create type public.membership_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.thesis_status as enum ('draft', 'active', 'archived');
create type public.candidate_status as enum (
  'candidate',
  'queued',
  'researching',
  'investigated',
  'failed',
  'high_priority',
  'monitoring',
  'passed',
  'pursuing'
);
create type public.source_record_status as enum ('received', 'normalized', 'rejected', 'superseded');
create type public.workflow_type as enum ('ingest_candidates', 'research_site', 'refresh_site', 'refresh_finding');
create type public.run_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'partial');
create type public.agent_kind as enum (
  'scout',
  'land_use',
  'development_history',
  'site_risk',
  'verifier',
  'next_best_action'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id)
);

create index organization_memberships_user_id_idx
  on public.organization_memberships (user_id, organization_id);

create table public.development_theses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  status public.thesis_status not null default 'draft',
  market text not null check (length(btrim(market)) between 1 and 200),
  strategy text not null check (length(btrim(strategy)) between 1 and 200),
  criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object'),
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  unique (organization_id, name, version)
);

create index development_theses_org_status_idx
  on public.development_theses (organization_id, status, updated_at desc);

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  adapter_key text not null check (adapter_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  agency text,
  jurisdiction text,
  base_url text check (base_url is null or base_url ~ '^https://'),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  unique (organization_id, adapter_key)
);

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  data_source_id uuid not null,
  external_record_id text not null check (length(btrim(external_record_id)) between 1 and 500),
  record_status public.source_record_status not null default 'received',
  source_uri text check (source_uri is null or source_uri ~ '^https://'),
  source_updated_at timestamptz,
  retrieved_at timestamptz not null default timezone('utc', now()),
  payload_checksum text not null check (payload_checksum ~ '^[0-9a-f]{64}$'),
  raw_payload jsonb,
  raw_object_path text,
  normalization_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(normalization_errors) = 'array'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  unique (organization_id, data_source_id, external_record_id, payload_checksum),
  foreign key (organization_id, data_source_id)
    references public.data_sources(organization_id, id) on delete restrict,
  check (raw_payload is not null or raw_object_path is not null),
  check (raw_object_path is null or raw_object_path !~ '(^|/)\.\.(/|$)')
);

create index source_records_source_external_idx
  on public.source_records (organization_id, data_source_id, external_record_id);
create index source_records_retrieved_at_idx
  on public.source_records (organization_id, retrieved_at desc);
create index source_records_status_idx
  on public.source_records (organization_id, record_status, created_at desc);

create table public.candidate_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  thesis_id uuid,
  status public.candidate_status not null default 'candidate',
  jurisdiction text not null check (length(btrim(jurisdiction)) between 1 and 200),
  apn text,
  normalized_apn text,
  address text,
  city text,
  region text,
  postal_code text,
  country_code text not null default 'US' check (country_code ~ '^[A-Z]{2}$'),
  parcel_acres numeric(14, 4) check (parcel_acres is null or parcel_acres >= 0),
  reported_capacity_units integer check (reported_capacity_units is null or reported_capacity_units >= 0),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  geometry_geojson jsonb check (geometry_geojson is null or jsonb_typeof(geometry_geojson) = 'object'),
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array'),
  normalized_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized_payload) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  foreign key (organization_id, thesis_id)
    references public.development_theses(organization_id, id) on delete restrict,
  check ((latitude is null) = (longitude is null)),
  check (normalized_apn is null or length(btrim(normalized_apn)) > 0)
);

create index candidate_sites_org_status_idx
  on public.candidate_sites (organization_id, status, updated_at desc);
create index candidate_sites_thesis_idx
  on public.candidate_sites (organization_id, thesis_id, status);
create index candidate_sites_normalized_apn_idx
  on public.candidate_sites (organization_id, jurisdiction, normalized_apn)
  where normalized_apn is not null;

create table public.candidate_source_records (
  organization_id uuid not null,
  candidate_site_id uuid not null,
  source_record_id uuid not null,
  match_method text not null check (match_method in ('source_identity', 'apn', 'address', 'geometry', 'manual')),
  match_confidence numeric(4, 3) not null check (match_confidence between 0 and 1),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (candidate_site_id, source_record_id),
  foreign key (organization_id, candidate_site_id)
    references public.candidate_sites(organization_id, id) on delete restrict,
  foreign key (organization_id, source_record_id)
    references public.source_records(organization_id, id) on delete restrict
);

create index candidate_source_records_source_idx
  on public.candidate_source_records (organization_id, source_record_id);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  candidate_site_id uuid,
  name text not null check (length(btrim(name)) between 1 and 240),
  jurisdiction text not null check (length(btrim(jurisdiction)) between 1 and 200),
  apn text,
  normalized_apn text,
  address text,
  city text,
  region text,
  postal_code text,
  country_code text not null default 'US' check (country_code ~ '^[A-Z]{2}$'),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  geometry_geojson jsonb check (geometry_geojson is null or jsonb_typeof(geometry_geojson) = 'object'),
  geometry_provenance text,
  current_snapshot_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  foreign key (organization_id, candidate_site_id)
    references public.candidate_sites(organization_id, id) on delete restrict,
  check ((latitude is null) = (longitude is null)),
  check (normalized_apn is null or length(btrim(normalized_apn)) > 0)
);

create unique index sites_org_jurisdiction_apn_uidx
  on public.sites (organization_id, jurisdiction, normalized_apn)
  where normalized_apn is not null;
create index sites_org_updated_at_idx
  on public.sites (organization_id, updated_at desc);

create table public.site_source_records (
  organization_id uuid not null,
  site_id uuid not null,
  source_record_id uuid not null,
  relationship text not null check (relationship in ('origin', 'enrichment', 'corroboration', 'conflict')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (site_id, source_record_id),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict,
  foreign key (organization_id, source_record_id)
    references public.source_records(organization_id, id) on delete restrict
);

create index site_source_records_source_idx
  on public.site_source_records (organization_id, source_record_id);

create table public.workflow_idempotency (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 255),
  operation public.workflow_type not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  requested_by uuid references auth.users(id) on delete set null,
  response jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  check (expires_at is null or expires_at > created_at)
);

create index workflow_idempotency_expiry_idx
  on public.workflow_idempotency (organization_id, expires_at)
  where expires_at is not null;

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  idempotency_id uuid not null,
  site_id uuid,
  thesis_id uuid,
  workflow_type public.workflow_type not null,
  status public.run_status not null default 'queued',
  provider text not null check (length(btrim(provider)) between 1 and 80),
  provider_run_id text,
  requested_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  finished_at timestamptz,
  source_cutoff_at timestamptz,
  attempt integer not null default 1 check (attempt > 0),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  output jsonb,
  error jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  unique (organization_id, idempotency_id),
  foreign key (organization_id, idempotency_id)
    references public.workflow_idempotency(organization_id, id) on delete restrict,
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict,
  foreign key (organization_id, thesis_id)
    references public.development_theses(organization_id, id) on delete restrict,
  check (started_at is null or started_at >= requested_at),
  check (finished_at is null or (started_at is not null and finished_at >= started_at)),
  check (status not in ('succeeded', 'failed', 'cancelled', 'partial') or finished_at is not null)
);

create index workflow_runs_org_status_idx
  on public.workflow_runs (organization_id, status, requested_at desc);
create index workflow_runs_site_idx
  on public.workflow_runs (organization_id, site_id, requested_at desc)
  where site_id is not null;
create unique index workflow_runs_provider_id_uidx
  on public.workflow_runs (organization_id, provider, provider_run_id)
  where provider_run_id is not null;

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_run_id uuid not null,
  site_id uuid,
  agent public.agent_kind not null,
  status public.run_status not null default 'queued',
  attempt integer not null default 1 check (attempt > 0),
  prompt_version text,
  provider text,
  model text,
  input_hash text check (input_hash is null or input_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz,
  finished_at timestamptz,
  output jsonb,
  error jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  unique (organization_id, site_id, id),
  unique (workflow_run_id, agent, attempt),
  foreign key (organization_id, workflow_run_id)
    references public.workflow_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict,
  check (finished_at is null or (started_at is not null and finished_at >= started_at)),
  check (status not in ('succeeded', 'failed', 'cancelled', 'partial') or finished_at is not null)
);

create index agent_runs_workflow_idx
  on public.agent_runs (organization_id, workflow_run_id, created_at);
create index agent_runs_site_status_idx
  on public.agent_runs (organization_id, site_id, status, created_at desc)
  where site_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row execute function public.set_updated_at();

create trigger development_theses_set_updated_at
before update on public.development_theses
for each row execute function public.set_updated_at();

create trigger data_sources_set_updated_at
before update on public.data_sources
for each row execute function public.set_updated_at();

create trigger candidate_sites_set_updated_at
before update on public.candidate_sites
for each row execute function public.set_updated_at();

create trigger sites_set_updated_at
before update on public.sites
for each row execute function public.set_updated_at();

create trigger workflow_runs_set_updated_at
before update on public.workflow_runs
for each row execute function public.set_updated_at();

create trigger agent_runs_set_updated_at
before update on public.agent_runs
for each row execute function public.set_updated_at();
