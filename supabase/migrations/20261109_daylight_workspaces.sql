begin;

create table if not exists public.daylight_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  revision uuid not null,
  planner jsonb not null check (jsonb_typeof(planner) = 'object')
);

alter table public.daylight_workspaces enable row level security;

revoke all on table public.daylight_workspaces from public, anon, authenticated;
grant select, insert on table public.daylight_workspaces to authenticated;
grant update (revision, planner) on table public.daylight_workspaces to authenticated;

drop policy if exists "Read own workspace" on public.daylight_workspaces;
create policy "Read own workspace" on public.daylight_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Create own workspace" on public.daylight_workspaces;
create policy "Create own workspace" on public.daylight_workspaces
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own workspace" on public.daylight_workspaces;
create policy "Update own workspace" on public.daylight_workspaces
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
