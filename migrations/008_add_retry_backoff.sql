-- Add columns
ALTER TABLE events_staging 
ADD COLUMN retry_at TIMESTAMPTZ,
ADD COLUMN processing_started_at TIMESTAMPTZ;

-- Safety backfill for old failed rows to satisfy constraints
UPDATE events_staging
SET retry_at = now()
WHERE status = 'failed' and retry_at IS NULL;

-- retry_count non negative
ALTER TABLE events_staging
ADD CONSTRAINT events_staging_retry_count_non_negative
CHECK (retry_count >= 0);

-- failed required retry_at
ALTER TABLE events_staging
ADD CONSTRAINT events_staging_failed_requires_retry_at
CHECK (
  status <> 'failed'
  OR retry_at IS NOT NULL
);

-- Index for eligible retry
CREATE INDEX IF NOT EXISTS idx_events_staging_retry_ready
ON events_staging(retry_at)
WHERE status = 'failed' AND dead = false;

-- Hot-path pending selection
CREATE INDEX IF NOT EXISTS idx_events_staging_pending
ON events_staging(received_at)
WHERE status = 'pending' AND dead = false;

-- Hot path stuck process selection
CREATE INDEX IF NOT EXISTS idx_events_staging_processing_timeout
ON events_staging(processing_started_at)
WHERE status = 'processing' AND dead = false;