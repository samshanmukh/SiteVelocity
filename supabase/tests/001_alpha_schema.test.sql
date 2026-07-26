begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth, storage, pg_catalog;

select plan(35);

select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'research_snapshots', 'research snapshots table exists');
select has_table('public', 'domain_projections', 'domain projections table exists');
select has_table('public', 'watchlists', 'watchlists table exists');
select has_table('public', 'watchlist_sites', 'watchlist membership table exists');
select has_table('public', 'watchlist_notifications', 'watchlist notifications table exists');
select has_table('public', 'managed_ingestion_batches', 'managed ingestion landing table exists');
select has_table('public', 'feasibility_scenarios', 'feasibility scenarios table exists');
select has_table('public', 'workspace_agent_settings', 'workspace agent settings table exists');
select ok(
  to_regprocedure('public.activate_research_snapshot(uuid,uuid)') is not null,
  'atomic snapshot activation function exists'
);

select is(
  (
    select count(*)
      from unnest(array[
        'organizations',
        'organization_memberships',
        'development_theses',
        'data_sources',
        'source_records',
        'candidate_sites',
        'candidate_source_records',
        'sites',
        'site_source_records',
        'workflow_idempotency',
        'workflow_runs',
        'agent_runs',
        'evidence',
        'findings',
        'finding_evidence',
        'research_snapshots',
        'snapshot_evidence',
        'snapshot_findings',
        'snapshot_agent_runs',
        'development_events',
        'entitlement_events',
        'permit_events',
        'site_scores',
        'next_actions',
        'snapshot_events',
        'snapshot_scores',
        'snapshot_next_actions',
        'domain_projections',
        'watchlists',
        'watchlist_sites',
        'watchlist_notifications',
        'managed_ingestion_batches',
        'feasibility_scenarios',
        'workspace_agent_settings'
      ]) expected(table_name)
      left join pg_class relation on relation.relname = expected.table_name
      left join pg_namespace namespace
        on namespace.oid = relation.relnamespace
       and namespace.nspname = 'public'
     where relation.oid is null or not relation.relrowsecurity
  ),
  0::bigint,
  'RLS is enabled on every SiteVelocity public table'
);

select is(
  (
    select count(*)
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname = 'public'
       and procedure.proname in (
         'set_updated_at',
         'reject_immutable_change',
         'activate_research_snapshot',
         'get_effective_research_snapshot',
         'is_organization_member',
         'has_organization_role',
         'storage_object_organization_id'
       )
       and not exists (
         select 1
           from unnest(coalesce(procedure.proconfig, array[]::text[])) setting
          where setting like 'search_path=%'
       )
  ),
  0::bigint,
  'all helper and RPC functions have a fixed search_path'
);

select is(
  (
    select count(*)
      from storage.buckets
     where id in ('sitevelocity-evidence', 'sitevelocity-raw-sources')
       and not public
  ),
  2::bigint,
  'evidence and raw-source buckets are private'
);

select ok(
  exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'sitevelocity_private_research_objects_member_read'
       and cmd = 'SELECT'
  ),
  'private research objects have an organization-member read policy'
);

select ok(
  not has_table_privilege('anon', 'public.organizations', 'SELECT'),
  'anonymous clients have no application-table read privilege'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.activate_research_snapshot(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot activate snapshots directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.activate_research_snapshot(uuid,uuid)',
    'EXECUTE'
  ),
  'the trusted service role can activate accepted snapshots'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000101',
    'authenticated',
    'authenticated',
    'owner@sitevelocity.test',
    '',
    '2026-07-25 00:00:00+00',
    '{}'::jsonb,
    '{}'::jsonb,
    '2026-07-25 00:00:00+00',
    '2026-07-25 00:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000102',
    'authenticated',
    'authenticated',
    'outsider@sitevelocity.test',
    '',
    '2026-07-25 00:00:00+00',
    '{}'::jsonb,
    '{}'::jsonb,
    '2026-07-25 00:00:00+00',
    '2026-07-25 00:00:00+00'
  );

insert into public.organizations (id, name, slug, created_at, updated_at)
values
  (
    '10000000-0000-4000-8000-000000000201',
    'Alpha Test Organization',
    'alpha-test-organization',
    '2026-07-25 00:00:00+00',
    '2026-07-25 00:00:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000202',
    'Other Test Organization',
    'other-test-organization',
    '2026-07-25 00:00:00+00',
    '2026-07-25 00:00:00+00'
  );

insert into public.organization_memberships (
  organization_id,
  user_id,
  role,
  created_at,
  updated_at
)
values (
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000101',
  'owner',
  '2026-07-25 00:00:00+00',
  '2026-07-25 00:00:00+00'
);

insert into public.sites (
  id,
  organization_id,
  name,
  jurisdiction,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000201',
    'Activation Test Site',
    'Test Jurisdiction',
    '2026-07-25 00:00:00+00',
    '2026-07-25 00:00:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000302',
    '10000000-0000-4000-8000-000000000201',
    'Fallback Test Site',
    'Test Jurisdiction',
    '2026-07-25 00:00:00+00',
    '2026-07-25 00:00:00+00'
  );

insert into public.workflow_idempotency (
  id,
  organization_id,
  idempotency_key,
  operation,
  request_hash,
  created_at
)
values
  (
    '10000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000201',
    'activation-test-command',
    'research_site',
    repeat('a', 64),
    '2026-07-25 00:00:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000201',
    'fallback-test-command',
    'research_site',
    repeat('b', 64),
    '2026-07-25 00:00:00+00'
  );

insert into public.workflow_runs (
  id,
  organization_id,
  idempotency_id,
  site_id,
  workflow_type,
  status,
  provider,
  requested_at,
  started_at,
  finished_at,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000501',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000301',
    'research_site',
    'succeeded',
    'test',
    '2026-07-25 00:00:00+00',
    '2026-07-25 00:00:01+00',
    '2026-07-25 00:00:02+00',
    '2026-07-25 00:00:00+00',
    '2026-07-25 00:00:02+00'
  ),
  (
    '10000000-0000-4000-8000-000000000502',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000302',
    'research_site',
    'succeeded',
    'test',
    '2026-07-25 00:00:00+00',
    '2026-07-25 00:00:01+00',
    '2026-07-25 00:00:02+00',
    '2026-07-25 00:00:00+00',
    '2026-07-25 00:00:02+00'
  );

insert into public.evidence (
  id,
  organization_id,
  site_id,
  category,
  title,
  retrieved_at,
  evidence_level,
  excerpt,
  content_checksum,
  created_at
)
values
  (
    '10000000-0000-4000-8000-000000000601',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000301',
    'test_only',
    'Synthetic test evidence',
    '2026-07-25 00:00:00+00',
    'ai_researched',
    'Used only inside a rolled-back database test.',
    repeat('c', 64),
    '2026-07-25 00:00:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000602',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000302',
    'test_only',
    'Synthetic fallback evidence',
    '2026-07-25 00:00:00+00',
    'ai_researched',
    'Used only inside a rolled-back database test.',
    repeat('d', 64),
    '2026-07-25 00:00:00+00'
  );

insert into public.findings (
  id,
  organization_id,
  site_id,
  category,
  field,
  value_json,
  status,
  evidence_level,
  confidence,
  impact,
  created_at
)
values (
  '10000000-0000-4000-8000-000000000701',
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000301',
  'test_only',
  'test_field',
  '"test_value"'::jsonb,
  'probable',
  'ai_researched',
  0.5,
  'unknown',
  '2026-07-25 00:00:00+00'
);

insert into public.research_snapshots (
  id,
  organization_id,
  site_id,
  workflow_run_id,
  version,
  status,
  accepted,
  accepted_at,
  acceptance_version,
  manifest_version,
  manifest_checksum,
  created_at
)
values
  (
    '10000000-0000-4000-8000-000000000801',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000501',
    1,
    'complete',
    true,
    '2026-07-25 00:01:00+00',
    'test-v1',
    '1.0.0',
    repeat('e', 64),
    '2026-07-25 00:01:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000802',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000501',
    2,
    'partial',
    true,
    '2026-07-25 00:02:00+00',
    'test-v1',
    '1.0.0',
    repeat('f', 64),
    '2026-07-25 00:02:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000803',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000302',
    '10000000-0000-4000-8000-000000000502',
    1,
    'complete',
    true,
    '2026-07-25 00:01:00+00',
    'test-v1',
    '1.0.0',
    repeat('1', 64),
    '2026-07-25 00:01:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000804',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000302',
    '10000000-0000-4000-8000-000000000502',
    2,
    'partial',
    true,
    '2026-07-25 00:02:00+00',
    'test-v1',
    '1.0.0',
    repeat('2', 64),
    '2026-07-25 00:02:00+00'
  );

insert into public.snapshot_evidence (
  organization_id,
  site_id,
  snapshot_id,
  evidence_id,
  created_at
)
values
  (
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000801',
    '10000000-0000-4000-8000-000000000601',
    '2026-07-25 00:01:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000802',
    '10000000-0000-4000-8000-000000000601',
    '2026-07-25 00:02:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000302',
    '10000000-0000-4000-8000-000000000803',
    '10000000-0000-4000-8000-000000000602',
    '2026-07-25 00:01:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000302',
    '10000000-0000-4000-8000-000000000804',
    '10000000-0000-4000-8000-000000000602',
    '2026-07-25 00:02:00+00'
  );

insert into storage.objects (id, bucket_id, name, metadata)
values
  (
    '10000000-0000-4000-8000-000000000901',
    'sitevelocity-evidence',
    '10000000-0000-4000-8000-000000000201/test/member-object.txt',
    '{}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000902',
    'sitevelocity-evidence',
    '10000000-0000-4000-8000-000000000202/test/other-object.txt',
    '{}'::jsonb
  );

insert into public.candidate_sites (
  id,
  organization_id,
  jurisdiction,
  created_at,
  updated_at
)
values (
  '10000000-0000-4000-8000-000000000303',
  '10000000-0000-4000-8000-000000000202',
  'Other Test Jurisdiction',
  '2026-07-25 00:00:00+00',
  '2026-07-25 00:00:00+00'
);

insert into public.domain_projections (
  id,
  organization_id,
  projection_kind,
  scope_key,
  version_key,
  status,
  source_cutoff_at,
  payload,
  content_checksum,
  created_at
)
values
  (
    '10000000-0000-4000-8000-000000000911',
    '10000000-0000-4000-8000-000000000201',
    'candidate_set',
    'thesis-one',
    'version-one',
    'complete',
    '2026-07-25 00:00:00+00',
    '{"test":true}'::jsonb,
    repeat('3', 64),
    '2026-07-25 00:00:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000912',
    '10000000-0000-4000-8000-000000000202',
    'candidate_set',
    'thesis-two',
    'version-one',
    'complete',
    '2026-07-25 00:00:00+00',
    '{"test":true}'::jsonb,
    repeat('4', 64),
    '2026-07-25 00:00:00+00'
  );

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000101', true);
set local role authenticated;

select is(
  (select count(*) from public.organizations),
  1::bigint,
  'an organization member reads only their organization'
);

select is(
  (select count(*) from public.domain_projections),
  1::bigint,
  'an organization member reads only their domain projections'
);

select is(
  (
    select count(*)
      from storage.objects
     where bucket_id = 'sitevelocity-evidence'
  ),
  1::bigint,
  'an organization member reads only objects under their organization prefix'
);

select throws_ok(
  $$insert into public.evidence (organization_id) values ('10000000-0000-4000-8000-000000000201')$$,
  '42501',
  'permission denied for table evidence',
  'authenticated members cannot write service-owned research records'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000102', true);
set local role authenticated;

select is(
  (select count(*) from public.organizations),
  0::bigint,
  'a non-member cannot read another organization'
);

select is(
  (select count(*) from public.domain_projections),
  0::bigint,
  'a non-member cannot read another organization domain projection'
);

select is(
  (
    select count(*)
      from storage.objects
     where bucket_id = 'sitevelocity-evidence'
  ),
  0::bigint,
  'a non-member cannot read another organization storage prefix'
);

reset role;

create function pg_temp.cross_tenant_site_link_is_rejected()
returns boolean
language plpgsql
as $$
begin
  insert into public.sites (
    id,
    organization_id,
    candidate_site_id,
    name,
    jurisdiction
  )
  values (
    '10000000-0000-4000-8000-000000000399',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000303',
    'Invalid Cross-Tenant Site',
    'Test Jurisdiction'
  );
  return false;
exception when foreign_key_violation then
  return true;
end;
$$;

select ok(
  pg_temp.cross_tenant_site_link_is_rejected(),
  'composite foreign keys reject cross-organization relationships'
);

select throws_ok(
  $$update public.evidence set title = 'changed' where id = '10000000-0000-4000-8000-000000000601'$$,
  '55000',
  'public.evidence rows are immutable',
  'evidence cannot be updated'
);

select throws_ok(
  $$update public.findings set note = 'changed' where id = '10000000-0000-4000-8000-000000000701'$$,
  '55000',
  'public.findings rows are immutable',
  'findings cannot be updated'
);

select throws_ok(
  $$update public.research_snapshots set summary = '{"changed":true}' where id = '10000000-0000-4000-8000-000000000801'$$,
  '55000',
  'public.research_snapshots rows are immutable',
  'research snapshots cannot be updated'
);

select throws_ok(
  $$update public.domain_projections set status = 'partial' where id = '10000000-0000-4000-8000-000000000911'$$,
  '55000',
  'public.domain_projections rows are immutable',
  'domain projections cannot be updated'
);

create function pg_temp.duplicate_idempotency_is_rejected()
returns boolean
language plpgsql
as $$
begin
  insert into public.workflow_idempotency (
    id,
    organization_id,
    idempotency_key,
    operation,
    request_hash
  )
  values (
    '10000000-0000-4000-8000-000000000499',
    '10000000-0000-4000-8000-000000000201',
    'activation-test-command',
    'research_site',
    repeat('9', 64)
  );
  return false;
exception when unique_violation then
  return true;
end;
$$;

select ok(
  pg_temp.duplicate_idempotency_is_rejected(),
  'an idempotency key cannot be reused within an organization'
);

select is(
  (
    select id
      from public.get_effective_research_snapshot('10000000-0000-4000-8000-000000000302')
  ),
  '10000000-0000-4000-8000-000000000803'::uuid,
  'snapshot fallback prefers the latest complete snapshot over a newer partial snapshot'
);

select lives_ok(
  $$select public.activate_research_snapshot(
    '10000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000801'
  )$$,
  'an accepted complete snapshot can be activated atomically'
);

select is(
  (
    select current_snapshot_id
      from public.sites
     where id = '10000000-0000-4000-8000-000000000301'
  ),
  '10000000-0000-4000-8000-000000000801'::uuid,
  'activation updates the site snapshot pointer'
);

select throws_ok(
  $$select public.activate_research_snapshot(
    '10000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000802'
  )$$,
  '22023',
  'partial snapshot cannot replace complete snapshot',
  'a partial refresh cannot replace a complete active snapshot'
);

select is(
  (
    select current_snapshot_id
      from public.sites
     where id = '10000000-0000-4000-8000-000000000301'
  ),
  '10000000-0000-4000-8000-000000000801'::uuid,
  'failed activation preserves the previously active snapshot'
);

select * from finish();
rollback;
