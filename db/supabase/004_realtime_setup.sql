-- Enable the Supabase Realtime publication
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

-- Attach our critical tables to the WebSocket engine for 0-latency sync
ALTER PUBLICATION supabase_realtime ADD TABLE messes;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
