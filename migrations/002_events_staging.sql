CREATE TABLE IF NOT EXISTS events_staging (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,

  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  retry_count INT NOT NULL DEFAULT 0
);

-- Worker hot path index
CREATE INDEX IF NOT EXISTS idx_events_staging_pending
  ON events_staging (status, received_at);

-- Optional observability helper
CREATE INDEX IF NOT EXISTS idx_events_staging_status
  ON events_staging (status);
