-- Deterministic local-development seed.
-- This creates product configuration only: no parcels, candidates, evidence,
-- findings, scores, or other property-specific facts are fabricated.

begin;

insert into public.organizations (
  id,
  name,
  slug,
  created_at,
  updated_at
)
values (
  '00000000-0000-4000-8000-000000000001',
  'SiteVelocity Local Development',
  'sitevelocity-local-development',
  '2026-07-25 00:00:00+00',
  '2026-07-25 00:00:00+00'
)
on conflict (id) do nothing;

insert into public.development_theses (
  id,
  organization_id,
  name,
  status,
  market,
  strategy,
  criteria,
  version,
  created_at,
  updated_at
)
values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'San Jose Multifamily Alpha',
  'draft',
  'San Jose, California',
  'Multifamily and mixed-use residential redevelopment',
  '{
    "county": "Santa Clara",
    "jurisdiction": "San Jose",
    "minimumParcelAcres": 0.5,
    "maximumParcelAcres": 10,
    "preferredMinimumReportedCapacityUnits": 100,
    "seedPurpose": "local_configuration_only"
  }'::jsonb,
  1,
  '2026-07-25 00:00:00+00',
  '2026-07-25 00:00:00+00'
)
on conflict (id) do nothing;

commit;
