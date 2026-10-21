-- Supabase's Data API (PostgREST and GraphQL) answers requests as the "anon" and "authenticated"
-- roles. UNIIVERSE does not use it: the app reaches its tables only through its own server, as the
-- database user that owns them (docs/DATABASE_PERMISSIONS.md). Until 30 October 2026 Supabase gave
-- both roles every privilege on each new table in public, and Row Level Security (on for every
-- table, with no policies) kept them out of every row. From that date new tables get no grants.
--
-- This takes those grants back from the app's own tables and sequences, so every table is closed
-- to the Data API however old it is, and gives the read-only backup role, where it exists
-- (docs/BACKUPS.md), SELECT on them explicitly instead of through default privileges. Objects
-- owned by other roles (Supabase's own) and service_role's grants are left as they are. Nothing
-- is read, written or deleted.
--
-- Reversible: GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated; and the same for
-- ALL SEQUENCES.
DO $$
DECLARE
  obj record;
  api text;
BEGIN
  FOR obj IN
    SELECT c.relname, CASE WHEN c.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S') AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  LOOP
    FOREACH api IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api) THEN
        EXECUTE format('REVOKE ALL ON %s public.%I FROM %I', obj.kind, obj.relname, api);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniiverse_backup') THEN
      EXECUTE format('GRANT SELECT ON %s public.%I TO uniiverse_backup', obj.kind, obj.relname);
    END IF;
  END LOOP;
END $$;
