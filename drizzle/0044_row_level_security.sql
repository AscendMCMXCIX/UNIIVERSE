-- Row Level Security on every application table, with no policies.
--
-- UNIIVERSE reaches its database only through its own server, as the database user that owns
-- these tables; an owner is not subject to Row Level Security, so the app keeps full access.
-- Supabase also exposes the public schema through its Data API (REST) to the "anon" and
-- "authenticated" roles. With RLS on and no policy, those roles see no rows and can change none,
-- so the anon key alone can never read accounts, sessions or player data.
--
-- Only tables owned by the user running this migration (the app's own user) are changed, so the
-- app can never lock itself out. Nothing is read, written or deleted. Reversible per table with
-- ALTER TABLE ... DISABLE ROW LEVEL SECURITY.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
