CREATE TABLE events (
  id UUID PRIMARY KEY,               -- logical event id (idempotency key)
  name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_events_name
  ON events (name);

CREATE INDEX idx_events_occurred_at
  ON events (occurred_at);
