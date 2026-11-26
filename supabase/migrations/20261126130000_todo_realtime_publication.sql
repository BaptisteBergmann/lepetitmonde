-- Realtime: publish the to-do tables so the relay can signal live changes.
-- The publication is managed by hand elsewhere, so every step is guarded:
-- skip if it doesn't exist, is FOR ALL TABLES (ADD TABLE would error), or
-- already contains the table.
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication
    WHERE pubname = 'supabase_realtime' AND NOT puballtables
  ) THEN
    FOREACH t IN ARRAY ARRAY['todo_lists', 'todo_items'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."%I"', t);
      END IF;
    END LOOP;
  END IF;
END $$;
