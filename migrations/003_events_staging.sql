CREATE TABLE events_staging (
  staging_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  id UUID NOT NULL,             -- logical event id (same as events.id)
  name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,

  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  retry_count INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot path for workers
CREATE INDEX idx_events_staging_pending
  ON events_staging (status, received_at);

-- Lookup by logical event
CREATE INDEX idx_events_staging_event_id
  ON events_staging (id);

-- Optional observability helper
CREATE INDEX idx_events_staging_status
  ON events_staging (status);