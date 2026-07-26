-- Tenant isolation, least-privilege grants, and private research object storage.

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.organization_memberships membership
     where membership.organization_id = p_organization_id
       and membership.user_id = auth.uid()
  );
$$;

create or replace function public.has_organization_role(
  p_organization_id uuid,
  p_allowed_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.organization_memberships membership
     where membership.organization_id = p_organization_id
       and membership.user_id = auth.uid()
       and membership.role = any (p_allowed_roles)
  );
$$;

revoke all on function public.is_organization_member(uuid) from public, anon;
revoke all on function public.has_organization_role(uuid, public.membership_role[]) from public, anon;
grant execute on function public.is_organization_member(uuid) to authenticated, service_role;
grant execute on function public.has_organization_role(uuid, public.membership_role[]) to authenticated, service_role;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.development_theses enable row level security;
alter table public.data_sources enable row level security;
alter table public.source_records enable row level security;
alter table public.candidate_sites enable row level security;
alter table public.candidate_source_records enable row level security;
alter table public.sites enable row level security;
alter table public.site_source_records enable row level security;
alter table public.workflow_idempotency enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.agent_runs enable row level security;
alter table public.evidence enable row level security;
alter table public.findings enable row level security;
alter table public.finding_evidence enable row level security;
alter table public.research_snapshots enable row level security;
alter table public.snapshot_evidence enable row level security;
alter table public.snapshot_findings enable row level security;
alter table public.snapshot_agent_runs enable row level security;
alter table public.development_events enable row level security;
alter table public.entitlement_events enable row level security;
alter table public.permit_events enable row level security;
alter table public.site_scores enable row level security;
alter table public.next_actions enable row level security;
alter table public.snapshot_events enable row level security;
alter table public.snapshot_scores enable row level security;
alter table public.snapshot_next_actions enable row level security;

create policy organizations_member_read
on public.organizations for select to authenticated
using (public.is_organization_member(id));

create policy organizations_admin_update
on public.organizations for update to authenticated
using (public.has_organization_role(id, array['owner', 'admin']::public.membership_role[]))
with check (public.has_organization_role(id, array['owner', 'admin']::public.membership_role[]));

create policy memberships_member_read
on public.organization_memberships for select to authenticated
using (public.is_organization_member(organization_id));

create policy memberships_owner_insert
on public.organization_memberships for insert to authenticated
with check (public.has_organization_role(organization_id, array['owner']::public.membership_role[]));

create policy memberships_owner_update
on public.organization_memberships for update to authenticated
using (public.has_organization_role(organization_id, array['owner']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner']::public.membership_role[]));

create policy memberships_owner_delete
on public.organization_memberships for delete to authenticated
using (public.has_organization_role(organization_id, array['owner']::public.membership_role[]));

create policy development_theses_member_read
on public.development_theses for select to authenticated
using (public.is_organization_member(organization_id));

create policy development_theses_editor_insert
on public.development_theses for insert to authenticated
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy development_theses_editor_update
on public.development_theses for update to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
))
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy development_theses_editor_delete
on public.development_theses for delete to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy data_sources_member_read
on public.data_sources for select to authenticated
using (public.is_organization_member(organization_id));

create policy data_sources_admin_insert
on public.data_sources for insert to authenticated
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin']::public.membership_role[]
));

create policy data_sources_admin_update
on public.data_sources for update to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin']::public.membership_role[]
))
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin']::public.membership_role[]
));

create policy source_records_member_read
on public.source_records for select to authenticated
using (public.is_organization_member(organization_id));

create policy candidate_sites_member_read
on public.candidate_sites for select to authenticated
using (public.is_organization_member(organization_id));

create policy candidate_sites_editor_insert
on public.candidate_sites for insert to authenticated
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy candidate_sites_editor_update
on public.candidate_sites for update to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
))
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy candidate_sites_editor_delete
on public.candidate_sites for delete to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy candidate_source_records_member_read
on public.candidate_source_records for select to authenticated
using (public.is_organization_member(organization_id));

create policy sites_member_read
on public.sites for select to authenticated
using (public.is_organization_member(organization_id));

create policy sites_editor_insert
on public.sites for insert to authenticated
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy sites_editor_update
on public.sites for update to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
))
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy sites_editor_delete
on public.sites for delete to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy site_source_records_member_read
on public.site_source_records for select to authenticated
using (public.is_organization_member(organization_id));

create policy workflow_idempotency_member_read
on public.workflow_idempotency for select to authenticated
using (public.is_organization_member(organization_id));

create policy workflow_runs_member_read
on public.workflow_runs for select to authenticated
using (public.is_organization_member(organization_id));

create policy agent_runs_member_read
on public.agent_runs for select to authenticated
using (public.is_organization_member(organization_id));

create policy evidence_member_read
on public.evidence for select to authenticated
using (public.is_organization_member(organization_id));

create policy findings_member_read
on public.findings for select to authenticated
using (public.is_organization_member(organization_id));

create policy finding_evidence_member_read
on public.finding_evidence for select to authenticated
using (public.is_organization_member(organization_id));

create policy research_snapshots_member_read
on public.research_snapshots for select to authenticated
using (public.is_organization_member(organization_id));

create policy snapshot_evidence_member_read
on public.snapshot_evidence for select to authenticated
using (public.is_organization_member(organization_id));

create policy snapshot_findings_member_read
on public.snapshot_findings for select to authenticated
using (public.is_organization_member(organization_id));

create policy snapshot_agent_runs_member_read
on public.snapshot_agent_runs for select to authenticated
using (public.is_organization_member(organization_id));

create policy development_events_member_read
on public.development_events for select to authenticated
using (public.is_organization_member(organization_id));

create policy entitlement_events_member_read
on public.entitlement_events for select to authenticated
using (public.is_organization_member(organization_id));

create policy permit_events_member_read
on public.permit_events for select to authenticated
using (public.is_organization_member(organization_id));

create policy site_scores_member_read
on public.site_scores for select to authenticated
using (public.is_organization_member(organization_id));

create policy next_actions_member_read
on public.next_actions for select to authenticated
using (public.is_organization_member(organization_id));

create policy snapshot_events_member_read
on public.snapshot_events for select to authenticated
using (public.is_organization_member(organization_id));

create policy snapshot_scores_member_read
on public.snapshot_scores for select to authenticated
using (public.is_organization_member(organization_id));

create policy snapshot_next_actions_member_read
on public.snapshot_next_actions for select to authenticated
using (public.is_organization_member(organization_id));

-- API clients must have table privileges as well as an RLS policy. Research,
-- ingestion lineage, workflows, and snapshot records intentionally remain
-- service-write/member-read.
revoke all on table
  public.organizations,
  public.organization_memberships,
  public.development_theses,
  public.data_sources,
  public.source_records,
  public.candidate_sites,
  public.candidate_source_records,
  public.sites,
  public.site_source_records,
  public.workflow_idempotency,
  public.workflow_runs,
  public.agent_runs,
  public.evidence,
  public.findings,
  public.finding_evidence,
  public.research_snapshots,
  public.snapshot_evidence,
  public.snapshot_findings,
  public.snapshot_agent_runs,
  public.development_events,
  public.entitlement_events,
  public.permit_events,
  public.site_scores,
  public.next_actions,
  public.snapshot_events,
  public.snapshot_scores,
  public.snapshot_next_actions
from anon, authenticated;

grant select on table
  public.organizations,
  public.organization_memberships,
  public.development_theses,
  public.data_sources,
  public.source_records,
  public.candidate_sites,
  public.candidate_source_records,
  public.sites,
  public.site_source_records,
  public.workflow_idempotency,
  public.workflow_runs,
  public.agent_runs,
  public.evidence,
  public.findings,
  public.finding_evidence,
  public.research_snapshots,
  public.snapshot_evidence,
  public.snapshot_findings,
  public.snapshot_agent_runs,
  public.development_events,
  public.entitlement_events,
  public.permit_events,
  public.site_scores,
  public.next_actions,
  public.snapshot_events,
  public.snapshot_scores,
  public.snapshot_next_actions
to authenticated;

grant update (name, slug) on public.organizations to authenticated;
grant insert on public.organization_memberships to authenticated;
grant update (role) on public.organization_memberships to authenticated;
grant delete on public.organization_memberships to authenticated;
grant insert on public.development_theses to authenticated;
grant update (name, status, market, strategy, criteria, version) on public.development_theses to authenticated;
grant delete on public.development_theses to authenticated;
grant insert on public.data_sources to authenticated;
grant update (display_name, agency, jurisdiction, base_url, configuration, enabled) on public.data_sources to authenticated;
grant insert on public.candidate_sites to authenticated;
grant update (
  thesis_id,
  status,
  jurisdiction,
  apn,
  normalized_apn,
  address,
  city,
  region,
  postal_code,
  country_code,
  parcel_acres,
  reported_capacity_units,
  latitude,
  longitude,
  geometry_geojson,
  signals,
  normalized_payload
) on public.candidate_sites to authenticated;
grant delete on public.candidate_sites to authenticated;
grant insert on public.sites to authenticated;
grant update (
  candidate_site_id,
  name,
  jurisdiction,
  apn,
  normalized_apn,
  address,
  city,
  region,
  postal_code,
  country_code,
  latitude,
  longitude,
  geometry_geojson,
  geometry_provenance
) on public.sites to authenticated;
grant delete on public.sites to authenticated;

grant all on table
  public.organizations,
  public.organization_memberships,
  public.development_theses,
  public.data_sources,
  public.source_records,
  public.candidate_sites,
  public.candidate_source_records,
  public.sites,
  public.site_source_records,
  public.workflow_idempotency,
  public.workflow_runs,
  public.agent_runs,
  public.evidence,
  public.findings,
  public.finding_evidence,
  public.research_snapshots,
  public.snapshot_evidence,
  public.snapshot_findings,
  public.snapshot_agent_runs,
  public.development_events,
  public.entitlement_events,
  public.permit_events,
  public.site_scores,
  public.next_actions,
  public.snapshot_events,
  public.snapshot_scores,
  public.snapshot_next_actions
to service_role;

create or replace function public.storage_object_organization_id(p_object_name text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_prefix text;
begin
  v_prefix := split_part(p_object_name, '/', 1);
  if v_prefix ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    return v_prefix::uuid;
  end if;
  return null;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function public.storage_object_organization_id(text) from public, anon;
grant execute on function public.storage_object_organization_id(text) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('sitevelocity-evidence', 'sitevelocity-evidence', false, 52428800),
  ('sitevelocity-raw-sources', 'sitevelocity-raw-sources', false, 104857600)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

create policy sitevelocity_private_research_objects_member_read
on storage.objects for select to authenticated
using (
  bucket_id in ('sitevelocity-evidence', 'sitevelocity-raw-sources')
  and public.is_organization_member(public.storage_object_organization_id(name))
);
