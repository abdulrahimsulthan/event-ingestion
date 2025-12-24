create table if not exists events (
  id uuid primary key,
  name text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  properties jsonb not null default '{}'::jsonb
);

create index if not exists idx_events_name
  on events (name);
