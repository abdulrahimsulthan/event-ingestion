ALTER TABLE events_staging
ADD COLUMN dead BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_events_staging_pending_live
ON events_staging (status)
WHERE dead = false;