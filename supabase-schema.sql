create schema if not exists clipwise;

create table if not exists clipwise.app_state (
  id text primary key,
  data jsonb not null,
  saved_at bigint not null,
  updated_at timestamptz not null default now()
);

alter table clipwise.app_state enable row level security;

revoke all on schema clipwise from anon;
revoke all on schema clipwise from authenticated;
revoke all on table clipwise.app_state from anon;
revoke all on table clipwise.app_state from authenticated;
grant usage on schema clipwise to service_role;
grant select, insert, update, delete on table clipwise.app_state to service_role;
