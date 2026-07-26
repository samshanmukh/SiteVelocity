-- Versioned deterministic feasibility, yield, underwriting, and IC scenarios.
-- Scenarios are append-only; changing an assumption creates a new row.

create table public.feasibility_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  assumptions jsonb not null check (jsonb_typeof(assumptions) = 'object'),
  research_context jsonb not null check (jsonb_typeof(research_context) = 'object'),
  outputs jsonb not null check (jsonb_typeof(outputs) = 'object'),
  input_checksum text not null check (input_checksum ~ '^[0-9a-f]{64}$'),
  calculation_version text not null check (length(btrim(calculation_version)) between 1 and 40),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  unique (organization_id, site_id, input_checksum),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict
);

create index feasibility_scenarios_site_created_idx
  on public.feasibility_scenarios (organization_id, site_id, created_at desc);

create trigger feasibility_scenarios_immutable
before update or delete on public.feasibility_scenarios
for each row execute function public.reject_immutable_change();

alter table public.feasibility_scenarios enable row level security;

create policy feasibility_scenarios_member_read
on public.feasibility_scenarios for select to authenticated
using (public.is_organization_member(organization_id));

revoke all on table public.feasibility_scenarios from anon, authenticated;
grant select on table public.feasibility_scenarios to authenticated;
grant all on table public.feasibility_scenarios to service_role;
