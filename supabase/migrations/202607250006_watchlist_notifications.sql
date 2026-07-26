-- Durable alerts generated from immutable development events for watched sites.

create table public.watchlist_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  watchlist_id uuid not null,
  site_id uuid not null,
  development_event_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 500),
  summary text not null check (length(btrim(summary)) between 1 and 4000),
  severity text not null check (severity in ('info', 'material', 'critical')),
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, id),
  unique (organization_id, watchlist_id, development_event_id),
  foreign key (organization_id, watchlist_id)
    references public.watchlists(organization_id, id) on delete cascade,
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete restrict,
  foreign key (organization_id, site_id, development_event_id)
    references public.development_events(organization_id, site_id, id) on delete restrict
);

create index watchlist_notifications_unread_idx
  on public.watchlist_notifications (organization_id, watchlist_id, created_at desc)
  where read_at is null;

alter table public.watchlist_notifications enable row level security;

create policy watchlist_notifications_member_read
on public.watchlist_notifications for select to authenticated
using (public.is_organization_member(organization_id));

create policy watchlist_notifications_member_update
on public.watchlist_notifications for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

revoke all on table public.watchlist_notifications from anon, authenticated;
grant select on table public.watchlist_notifications to authenticated;
grant update (read_at) on public.watchlist_notifications to authenticated;
grant all on table public.watchlist_notifications to service_role;
