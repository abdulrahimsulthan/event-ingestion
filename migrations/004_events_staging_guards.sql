-- status whitelists
ALTER TABLE events_staging
ADD CONSTRAINT events_staging_valid_status
CHECK (status IN ('pending', 'processed', 'failed'));

-- auto update updated_at
CREATE OR REPLACE FUNCTION touch_events_staging_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_updated_at ON events_staging;

CREATE TRIGGER trg_touch_updated_at
BEFORE UPDATE ON events_staging
FOR EACH ROW
EXECUTE FUNCTION touch_events_staging_updated_at();

-- enforce append only
CREATE OR REPLACE FUNCTION prevent_events_staging_payload_update()
RETURNS trigger AS $$
BEGIN
  IF
    NEW.event_id     <> OLD.event_id OR
    NEW.name         <> OLD.name OR
    NEW.occurred_at  <> OLD.occurred_at OR
    NEW.received_at  <> OLD.received_at OR
    NEW.properties  <> OLD.properties
  THEN
    RAISE EXCEPTION
      'events_staging is append-only: payload cannot be modified';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_staging_append_only ON events_staging;

CREATE TRIGGER trg_events_staging_append_only
BEFORE UPDATE ON events_staging
FOR EACH ROW
EXECUTE FUNCTION prevent_events_staging_payload_update();

-- enforce events_staging.status state machine
CREATE OR REPLACE FUNCTION enforce_events_staging_state_machine()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'processed' AND NEW.status <> 'processed' THEN
    RAISE EXCEPTION 'processed is a terminal state';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_staging_state_machine ON events_staging;

CREATE TRIGGER trg_events_staging_state_machine
BEFORE UPDATE ON events_staging
FOR EACH ROW
EXECUTE FUNCTION enforce_events_staging_state_machine();
