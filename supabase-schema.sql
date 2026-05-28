create table if not exists public.clipwise_app_state (
  id text primary key,
  data jsonb not null,
  saved_at bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.clipwise_app_state enable row level security;

revoke all on table public.clipwise_app_state from anon;
revoke all on table public.clipwise_app_state from authenticated;
grant select, insert, update, delete on table public.clipwise_app_state to service_role;

do $$
begin
  if to_regclass('clipwise.app_state') is not null then
    insert into public.clipwise_app_state (id, data, saved_at, updated_at)
    select id, data, saved_at, updated_at
    from clipwise.app_state
    on conflict (id) do update
    set data = excluded.data,
        saved_at = excluded.saved_at,
        updated_at = excluded.updated_at;
  end if;
end $$;
