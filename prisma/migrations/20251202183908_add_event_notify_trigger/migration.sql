-- Create notification function
CREATE OR REPLACE FUNCTION notify_new_event() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'new_event', 
    json_build_object(
      'eventId', NEW.event_id,
      'tableId', NEW.table_id,
      'kind', NEW.kind
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER event_notify_trigger
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_event();
