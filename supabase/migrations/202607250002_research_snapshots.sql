-- Immutable evidence graph, deterministic outputs, and research snapshot manifests.

create type public.evidence_level as enum (
  'document_verified',
  'gis_screened',
  'ai_researched',
  'professional_verification_required'
);
create type public.finding_status as enum ('verified', 'probable', 'unknown', 'conflicting');
create type public.finding_impact as enum ('opportunity', 'cost_timing_risk', 'fatal_constraint', 'unknown');
create type public.snapshot_status as enum ('partial', 'complete');
create type public.event_kind as enum ('entitlement', 'permit', 'development');
create type public.score_type as enum (
  'strategy_fit',
  'development_readiness',
  'site_feasibility',
  'deal_potential',
  'evidence_confidence'
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  source_record_id uuid,
  supersedes_evidence_id uuid,
  category text not null check (length(btrim(category)) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 500),
  agency text,
  source_uri text check (source_uri is null or source_uri ~ '^https://'),
  source_published_at timestamptz,
  retrieved_at timestamptz not null,
  evidence_level public.evidence_level not null,
  excerpt text check (excerpt is null or length(excerpt) <= 12000),
  structured_payload jsonb,
  object_path text,
  content_checksum text not null check (content_checksum ~ '^[0-9a-f]{64}$'),
  media_type text,
  professional_verification_required boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict,
  foreign key (organization_id, source_record_id)
    references public.source_records(organization_id, id) on delete restrict,
  foreign key (organization_id, site_id, supersedes_evidence_id)
    references public.evidence(organization_id, site_id, id) on delete restrict,
  check (excerpt is not null or structured_payload is not null or object_path is not null),
  check (object_path is null or object_path !~ '(^|/)\.\.(/|$)'),
  check (supersedes_evidence_id is null or supersedes_evidence_id <> id),
  check (
    evidence_level <> 'professional_verification_required'
    or professional_verification_required
  )
);

create unique index evidence_site_content_uidx
  on public.evidence (organization_id, site_id, content_checksum, coalesce(source_uri, ''));
create index evidence_site_category_idx
  on public.evidence (organization_id, site_id, category, retrieved_at desc);
create index evidence_source_record_idx
  on public.evidence (organization_id, source_record_id)
  where source_record_id is not null;

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  agent_run_id uuid,
  supersedes_finding_id uuid,
  category text not null check (length(btrim(category)) between 1 and 120),
  field text not null check (length(btrim(field)) between 1 and 160),
  value_json jsonb not null default 'null'::jsonb,
  status public.finding_status not null,
  evidence_level public.evidence_level not null,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  impact public.finding_impact not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict,
  foreign key (organization_id, site_id, agent_run_id)
    references public.agent_runs(organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, supersedes_finding_id)
    references public.findings(organization_id, site_id, id) on delete restrict,
  check (supersedes_finding_id is null or supersedes_finding_id <> id),
  check (status <> 'unknown' or confidence <= 0.5)
);

create index findings_site_category_idx
  on public.findings (organization_id, site_id, category, created_at desc);
create index findings_site_status_idx
  on public.findings (organization_id, site_id, status, impact);

create table public.finding_evidence (
  organization_id uuid not null,
  site_id uuid not null,
  finding_id uuid not null,
  evidence_id uuid not null,
  relationship text not null default 'supports'
    check (relationship in ('supports', 'contradicts', 'context')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (finding_id, evidence_id),
  foreign key (organization_id, site_id, finding_id)
    references public.findings(organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, evidence_id)
    references public.evidence(organization_id, site_id, id) on delete restrict
);

create index finding_evidence_evidence_idx
  on public.finding_evidence (organization_id, site_id, evidence_id);

create table public.research_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  workflow_run_id uuid not null,
  version integer not null check (version > 0),
  status public.snapshot_status not null,
  accepted boolean not null default false,
  accepted_at timestamptz,
  acceptance_version text,
  manifest_version text not null check (length(btrim(manifest_version)) between 1 and 40),
  manifest_checksum text not null check (manifest_checksum ~ '^[0-9a-f]{64}$'),
  source_cutoff_at timestamptz,
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, site_id, id),
  unique (organization_id, site_id, version),
  unique (organization_id, site_id, manifest_checksum),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict,
  foreign key (organization_id, workflow_run_id)
    references public.workflow_runs(organization_id, id) on delete restrict,
  check (
    (accepted and accepted_at is not null and acceptance_version is not null)
    or (not accepted and accepted_at is null)
  )
);

create index research_snapshots_site_status_idx
  on public.research_snapshots (organization_id, site_id, status, created_at desc);
create index research_snapshots_workflow_idx
  on public.research_snapshots (organization_id, workflow_run_id);

create table public.snapshot_evidence (
  organization_id uuid not null,
  site_id uuid not null,
  snapshot_id uuid not null,
  evidence_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (snapshot_id, evidence_id),
  foreign key (organization_id, site_id, snapshot_id)
    references public.research_snapshots(organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, evidence_id)
    references public.evidence(organization_id, site_id, id) on delete restrict
);

create table public.snapshot_findings (
  organization_id uuid not null,
  site_id uuid not null,
  snapshot_id uuid not null,
  finding_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (snapshot_id, finding_id),
  foreign key (organization_id, site_id, snapshot_id)
    references public.research_snapshots(organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, finding_id)
    references public.findings(organization_id, site_id, id) on delete restrict
);

create table public.snapshot_agent_runs (
  organization_id uuid not null,
  site_id uuid not null,
  snapshot_id uuid not null,
  agent_run_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (snapshot_id, agent_run_id),
  foreign key (organization_id, site_id, snapshot_id)
    references public.research_snapshots(organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, agent_run_id)
    references public.agent_runs(organization_id, site_id, id) on delete restrict
);

create table public.development_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  primary_evidence_id uuid,
  event_kind public.event_kind not null,
  event_type text not null check (length(btrim(event_type)) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 500),
  description text,
  event_date date,
  observed_at timestamptz not null,
  status text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  evidence_level public.evidence_level not null,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict,
  foreign key (organization_id, site_id, primary_evidence_id)
    references public.evidence(organization_id, site_id, id) on delete restrict
);

create index development_events_site_date_idx
  on public.development_events (organization_id, site_id, event_date desc, observed_at desc);
create index development_events_kind_idx
  on public.development_events (organization_id, site_id, event_kind, created_at desc);

create table public.entitlement_events (
  development_event_id uuid primary key,
  organization_id uuid not null,
  site_id uuid not null,
  application_number text,
  entitlement_type text,
  action text,
  decision_body text,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (organization_id, site_id, development_event_id)
    references public.development_events(organization_id, site_id, id) on delete restrict
);

create table public.permit_events (
  development_event_id uuid primary key,
  organization_id uuid not null,
  site_id uuid not null,
  permit_number text,
  permit_type text,
  action text,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (organization_id, site_id, development_event_id)
    references public.development_events(organization_id, site_id, id) on delete restrict
);

create table public.site_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  score_type public.score_type not null,
  score numeric(6, 3) not null check (score between 0 and 100),
  calculation_version text not null check (length(btrim(calculation_version)) between 1 and 80),
  calculated_at timestamptz not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  normalized_inputs jsonb not null check (jsonb_typeof(normalized_inputs) = 'object'),
  rule_weights jsonb not null default '{}'::jsonb check (jsonb_typeof(rule_weights) = 'object'),
  caps jsonb not null default '[]'::jsonb check (jsonb_typeof(caps) = 'array'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  material_flags jsonb not null default '[]'::jsonb check (jsonb_typeof(material_flags) = 'array'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, site_id, id),
  unique (organization_id, site_id, score_type, calculation_version, input_hash),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict
);

create index site_scores_site_type_idx
  on public.site_scores (organization_id, site_id, score_type, calculated_at desc);

create table public.next_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  agent_run_id uuid,
  priority smallint not null default 1 check (priority between 1 and 5),
  action_type text not null check (length(btrim(action_type)) between 1 and 120),
  unresolved_question text not null check (length(btrim(unresolved_question)) between 1 and 2000),
  why_it_matters text not null check (length(btrim(why_it_matters)) between 1 and 4000),
  resolver_role text not null check (length(btrim(resolver_role)) between 1 and 200),
  known_facts jsonb not null default '[]'::jsonb check (jsonb_typeof(known_facts) = 'array'),
  questions_to_ask jsonb not null default '[]'::jsonb check (jsonb_typeof(questions_to_ask) = 'array'),
  documents_to_request jsonb not null default '[]'::jsonb check (jsonb_typeof(documents_to_request) = 'array'),
  expected_follow_up text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict,
  foreign key (organization_id, site_id, agent_run_id)
    references public.agent_runs(organization_id, site_id, id) on delete restrict
);

create index next_actions_site_priority_idx
  on public.next_actions (organization_id, site_id, priority, created_at desc);

create table public.snapshot_events (
  organization_id uuid not null,
  site_id uuid not null,
  snapshot_id uuid not null,
  development_event_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (snapshot_id, development_event_id),
  foreign key (organization_id, site_id, snapshot_id)
    references public.research_snapshots(organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, development_event_id)
    references public.development_events(organization_id, site_id, id) on delete restrict
);

create table public.snapshot_scores (
  organization_id uuid not null,
  site_id uuid not null,
  snapshot_id uuid not null,
  site_score_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (snapshot_id, site_score_id),
  foreign key (organization_id, site_id, snapshot_id)
    references public.research_snapshots(organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, site_score_id)
    references public.site_scores(organization_id, site_id, id) on delete restrict
);

create table public.snapshot_next_actions (
  organization_id uuid not null,
  site_id uuid not null,
  snapshot_id uuid not null,
  next_action_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (snapshot_id, next_action_id),
  foreign key (organization_id, site_id, snapshot_id)
    references public.research_snapshots(organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, next_action_id)
    references public.next_actions(organization_id, site_id, id) on delete restrict
);

alter table public.sites
  add constraint sites_current_snapshot_fk
  foreign key (organization_id, id, current_snapshot_id)
  references public.research_snapshots(organization_id, site_id, id)
  on delete restrict
  deferrable initially immediate;

create or replace function public.reject_immutable_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%I.%I rows are immutable', tg_table_schema, tg_table_name);
end;
$$;

create trigger source_records_immutable
before update or delete on public.source_records
for each row execute function public.reject_immutable_change();
create trigger candidate_source_records_immutable
before update or delete on public.candidate_source_records
for each row execute function public.reject_immutable_change();
create trigger site_source_records_immutable
before update or delete on public.site_source_records
for each row execute function public.reject_immutable_change();
create trigger evidence_immutable
before update or delete on public.evidence
for each row execute function public.reject_immutable_change();
create trigger findings_immutable
before update or delete on public.findings
for each row execute function public.reject_immutable_change();
create trigger finding_evidence_immutable
before update or delete on public.finding_evidence
for each row execute function public.reject_immutable_change();
create trigger research_snapshots_immutable
before update or delete on public.research_snapshots
for each row execute function public.reject_immutable_change();
create trigger snapshot_evidence_immutable
before update or delete on public.snapshot_evidence
for each row execute function public.reject_immutable_change();
create trigger snapshot_findings_immutable
before update or delete on public.snapshot_findings
for each row execute function public.reject_immutable_change();
create trigger snapshot_agent_runs_immutable
before update or delete on public.snapshot_agent_runs
for each row execute function public.reject_immutable_change();
create trigger development_events_immutable
before update or delete on public.development_events
for each row execute function public.reject_immutable_change();
create trigger entitlement_events_immutable
before update or delete on public.entitlement_events
for each row execute function public.reject_immutable_change();
create trigger permit_events_immutable
before update or delete on public.permit_events
for each row execute function public.reject_immutable_change();
create trigger site_scores_immutable
before update or delete on public.site_scores
for each row execute function public.reject_immutable_change();
create trigger next_actions_immutable
before update or delete on public.next_actions
for each row execute function public.reject_immutable_change();
create trigger snapshot_events_immutable
before update or delete on public.snapshot_events
for each row execute function public.reject_immutable_change();
create trigger snapshot_scores_immutable
before update or delete on public.snapshot_scores
for each row execute function public.reject_immutable_change();
create trigger snapshot_next_actions_immutable
before update or delete on public.snapshot_next_actions
for each row execute function public.reject_immutable_change();

-- The workflow service calls this only after inserting a complete immutable manifest.
-- A partial refresh can never replace a complete active snapshot.
create or replace function public.activate_research_snapshot(
  p_site_id uuid,
  p_snapshot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_site public.sites%rowtype;
  v_snapshot public.research_snapshots%rowtype;
  v_current public.research_snapshots%rowtype;
begin
  select *
    into v_site
    from public.sites
   where id = p_site_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'site not found';
  end if;

  select *
    into v_snapshot
    from public.research_snapshots
   where id = p_snapshot_id
     and site_id = v_site.id
     and organization_id = v_site.organization_id;

  if not found then
    raise exception using errcode = '22023', message = 'snapshot does not belong to site';
  end if;

  if not v_snapshot.accepted then
    raise exception using errcode = '22023', message = 'snapshot has not passed acceptance';
  end if;

  if not exists (
    select 1
      from public.snapshot_evidence se
     where se.snapshot_id = v_snapshot.id
       and se.organization_id = v_snapshot.organization_id
       and se.site_id = v_snapshot.site_id
  ) then
    raise exception using errcode = '22023', message = 'snapshot manifest has no evidence';
  end if;

  if v_site.current_snapshot_id is not null then
    select *
      into v_current
      from public.research_snapshots
     where id = v_site.current_snapshot_id;

    if v_current.created_at > v_snapshot.created_at then
      raise exception using errcode = '22023', message = 'stale snapshot cannot replace active snapshot';
    end if;

    if v_current.status = 'complete' and v_snapshot.status = 'partial' then
      raise exception using errcode = '22023', message = 'partial snapshot cannot replace complete snapshot';
    end if;
  end if;

  update public.sites
     set current_snapshot_id = v_snapshot.id
   where id = v_site.id;

  return v_snapshot.id;
end;
$$;

revoke all on function public.activate_research_snapshot(uuid, uuid) from public;
revoke all on function public.activate_research_snapshot(uuid, uuid) from anon;
revoke all on function public.activate_research_snapshot(uuid, uuid) from authenticated;
grant execute on function public.activate_research_snapshot(uuid, uuid) to service_role;

-- Read fallback: an accepted active snapshot wins; otherwise choose the newest
-- complete snapshot, and only then the newest accepted partial snapshot.
create or replace function public.get_effective_research_snapshot(p_site_id uuid)
returns setof public.research_snapshots
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select rs.*
    from public.sites s
    join lateral (
      select candidate.*
        from public.research_snapshots candidate
       where candidate.organization_id = s.organization_id
         and candidate.site_id = s.id
         and candidate.accepted
       order by
         case
           when candidate.id = s.current_snapshot_id then 0
           when candidate.status = 'complete' then 1
           else 2
         end,
         candidate.created_at desc,
         candidate.id desc
       limit 1
    ) rs on true
   where s.id = p_site_id;
$$;

revoke all on function public.get_effective_research_snapshot(uuid) from public;
revoke all on function public.get_effective_research_snapshot(uuid) from anon;
grant execute on function public.get_effective_research_snapshot(uuid) to authenticated, service_role;
