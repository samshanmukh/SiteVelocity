-- Tenant-scoped agent policy used by the research workflow and administration UI.

create table public.workspace_agent_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled_agents jsonb not null default '{"land_use":true,"site_risk":true,"development_history":true,"verifier":true,"next_best_action":true}'::jsonb
    check (jsonb_typeof(enabled_agents) = 'object'),
  verification_depth text not null default 'standard'
    check (verification_depth in ('screening', 'standard', 'enhanced')),
  max_external_research_tasks_per_site integer not null default 2
    check (max_external_research_tasks_per_site between 0 and 2),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger workspace_agent_settings_set_updated_at
before update on public.workspace_agent_settings
for each row execute function public.set_updated_at();

alter table public.workspace_agent_settings enable row level security;

create policy workspace_agent_settings_member_read
on public.workspace_agent_settings for select to authenticated
using (public.is_organization_member(organization_id));

create policy workspace_agent_settings_admin_insert
on public.workspace_agent_settings for insert to authenticated
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin']::public.membership_role[]
));

create policy workspace_agent_settings_admin_update
on public.workspace_agent_settings for update to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin']::public.membership_role[]
))
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin']::public.membership_role[]
));

revoke all on table public.workspace_agent_settings from anon, authenticated;
grant select on table public.workspace_agent_settings to authenticated;
grant insert on table public.workspace_agent_settings to authenticated;
grant update (enabled_agents, verification_depth, max_external_research_tasks_per_site, updated_by)
  on public.workspace_agent_settings to authenticated;
grant all on table public.workspace_agent_settings to service_role;
