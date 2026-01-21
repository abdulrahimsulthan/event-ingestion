-- Drop old constraint
ALTER TABLE events_staging
DROP CONSTRAINT events_staging_valid_status;

-- Add new constraint
ALTER TABLE events_staging
ADD CONSTRAINT events_staging_valid_status
CHECK (status IN ('pending', 'processing', 'processed', 'failed'));

-- Update the events staging state machine
CREATE OR REPLACE FUNCTION enforce_events_staging_state_machine()
RETURNS trigger AS $$
BEGIN
  -- Terminal state
  IF OLD.status = 'processed' AND NEW.status <> 'processed' THEN
    RAISE EXCEPTION 'processed is terminal state';
  END IF;

  IF OLD.dead = true AND NEW.dead <> true THEN
    RAISE EXCEPTION 'dead is terminal state';
  END IF;

  -- Valid forward transitions
  IF OLD.status = 'pending' AND NEW.status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'pending can only transistion to processing';
  END IF;

  IF OLD.status = 'processing' AND NEW.status NOT IN ('processing', 'processed', 'failed') THEN
    RAISE EXCEPTION 'processing can only transition to processed or failed';
  END IF;

  IF OLD.status = 'failed' AND NEW.status NOT IN ('failed', 'pending') THEN
    RAISE EXCEPTION 'failed can only transition to pending or dead';
  END IF;

  -- dead implies not processable
  IF NEW.dead = true AND NEW.status <> 'failed' THEN
    RAISE EXCEPTION 'only failed events can be marked dead';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_staging_state_machine ON events_staging;

CREATE TRIGGER trg_events_staging_state_machine 
BEFORE UPDATE ON events_staging 
FOR EACH ROW 
EXECUTE FUNCTION enforce_events_staging_state_machine();
