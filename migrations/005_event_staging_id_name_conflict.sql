ALTER TABLE events_staging RENAME COLUMN id TO event_id;

DROP INDEX idx_events_staging_event_id;
CREATE INDEX idx_events_staging_event_id
  ON events_staging (event_id);