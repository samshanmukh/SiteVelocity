-- Tenant-scoped watchlists for standing site monitoring.

create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 160),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id)
);

create unique index watchlists_org_name_uidx
  on public.watchlists (organization_id, lower(name));

create table public.watchlist_sites (
  organization_id uuid not null,
  watchlist_id uuid not null,
  site_id uuid not null,
  external_site_id text not null check (length(btrim(external_site_id)) between 1 and 255),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (watchlist_id, site_id),
  foreign key (organization_id, watchlist_id)
    references public.watchlists(organization_id, id) on delete cascade,
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict
);

create index watchlist_sites_site_idx
  on public.watchlist_sites (organization_id, site_id, created_at desc);

create trigger watchlists_set_updated_at
before update on public.watchlists
for each row execute function public.set_updated_at();

alter table public.watchlists enable row level security;
alter table public.watchlist_sites enable row level security;

create policy watchlists_member_read
on public.watchlists for select to authenticated
using (public.is_organization_member(organization_id));

create policy watchlists_editor_insert
on public.watchlists for insert to authenticated
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy watchlists_editor_update
on public.watchlists for update to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
))
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy watchlists_editor_delete
on public.watchlists for delete to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy watchlist_sites_member_read
on public.watchlist_sites for select to authenticated
using (public.is_organization_member(organization_id));

create policy watchlist_sites_editor_insert
on public.watchlist_sites for insert to authenticated
with check (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

create policy watchlist_sites_editor_delete
on public.watchlist_sites for delete to authenticated
using (public.has_organization_role(
  organization_id,
  array['owner', 'admin', 'member']::public.membership_role[]
));

revoke all on table public.watchlists, public.watchlist_sites from anon, authenticated;
grant select, insert, update, delete on table public.watchlists to authenticated;
grant select, insert, delete on table public.watchlist_sites to authenticated;
grant all on table public.watchlists, public.watchlist_sites to service_role;
