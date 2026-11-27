CREATE TABLE "match_multikills" (
	"match_id" text NOT NULL,
	"slot" smallint NOT NULL,
	"puuid" text NOT NULL,
	"position" text,
	"champion_id" text,
	"queue_id" integer,
	"duration_s" integer NOT NULL,
	"team_id" smallint,
	"kills" smallint,
	"team_kills" smallint,
	"doubles" smallint NOT NULL,
	"triples" smallint NOT NULL,
	"quadras" smallint NOT NULL,
	"pentas" smallint NOT NULL,
	"largest" smallint,
	CONSTRAINT "match_multikills_match_id_slot_pk" PRIMARY KEY("match_id","slot")
);
--> statement-breakpoint
ALTER TABLE "match_multikills" ADD CONSTRAINT "match_multikills_match_id_match_details_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match_details"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The players' multikill counters, kept by the database from the stored records (docs/PERFORMANCE.md,
-- "The multikill comparison: the players' counters in their own table", 27 Nov 2026). The same
-- players as the comparison counted from the records' jsonb until then: not removed, with all four
-- counters stored as numbers. A value Postgres cannot read as a small whole number leaves that
-- player (or that one figure) out; it never fails the record's insert. A trigger function cannot be
-- called on its own and needs no grant (docs/DATABASE_PERMISSIONS.md); its search path is fixed.
CREATE FUNCTION public.match_multikills_rows() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  DELETE FROM public.match_multikills WHERE match_id = NEW.match_id;
  INSERT INTO public.match_multikills (match_id, slot, puuid, position, champion_id, queue_id, duration_s, team_id, kills, team_kills, doubles, triples, quadras, pentas, largest)
  SELECT NEW.match_id, (e.i - 1)::smallint, coalesce(e.x->>'puuid', ''), e.x->>'position', e.x->>'championId', NEW.queue_id, NEW.game_duration,
    CASE WHEN e.x->>'teamId' ~ '^-?[0-9]{1,4}$' THEN (e.x->>'teamId')::smallint END,
    CASE WHEN e.x->>'kills' ~ '^-?[0-9]{1,4}$' THEN (e.x->>'kills')::smallint END,
    (SELECT CASE WHEN t->'objectives'->>'champion' ~ '^-?[0-9]{1,4}$' THEN (t->'objectives'->>'champion')::smallint END
       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.teams) = 'array' THEN NEW.teams ELSE '[]'::jsonb END) AS t
       WHERE t->>'teamId' = e.x->>'teamId' LIMIT 1),
    (e.x->'stats'->>'doubleKills')::smallint, (e.x->'stats'->>'tripleKills')::smallint,
    (e.x->'stats'->>'quadraKills')::smallint, (e.x->'stats'->>'pentaKills')::smallint,
    CASE WHEN e.x->'stats'->>'largestMultiKill' ~ '^-?[0-9]{1,4}$' THEN (e.x->'stats'->>'largestMultiKill')::smallint END
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.participants) = 'array' THEN NEW.participants ELSE '[]'::jsonb END) WITH ORDINALITY AS e(x, i)
  WHERE e.x->>'removed' IS NULL
    AND jsonb_typeof(e.x->'stats'->'doubleKills') = 'number' AND jsonb_typeof(e.x->'stats'->'tripleKills') = 'number'
    AND jsonb_typeof(e.x->'stats'->'quadraKills') = 'number' AND jsonb_typeof(e.x->'stats'->'pentaKills') = 'number'
    AND (e.x->'stats'->>'doubleKills') ~ '^-?[0-9]{1,4}$' AND (e.x->'stats'->>'tripleKills') ~ '^-?[0-9]{1,4}$'
    AND (e.x->'stats'->>'quadraKills') ~ '^-?[0-9]{1,4}$' AND (e.x->'stats'->>'pentaKills') ~ '^-?[0-9]{1,4}$';
  RETURN NULL;
END $$;
--> statement-breakpoint
-- Whoever writes a record (the sync, the figures backfill, an erasure's redaction, the demo), its
-- rows follow; deleting the record deletes them (the foreign key's cascade). Created before the
-- backfill, inside the same migration transaction, so no record stored meanwhile is missed.
CREATE TRIGGER match_multikills_rows AFTER INSERT OR UPDATE OF participants, teams, queue_id, game_duration ON public.match_details
  FOR EACH ROW EXECUTE FUNCTION public.match_multikills_rows();
--> statement-breakpoint
-- The records already stored, once (each record's players are read from TOAST once, as 0058's and
-- 0069's indexes did: about a second locally for 7,600 records). The same rows as the trigger's.
-- Rebuilding it later (docs/BACKUPS.md): UPDATE match_details SET participants = participants.
INSERT INTO public.match_multikills (match_id, slot, puuid, position, champion_id, queue_id, duration_s, team_id, kills, team_kills, doubles, triples, quadras, pentas, largest)
SELECT md.match_id, (e.i - 1)::smallint, coalesce(e.x->>'puuid', ''), e.x->>'position', e.x->>'championId', md.queue_id, md.game_duration,
  CASE WHEN e.x->>'teamId' ~ '^-?[0-9]{1,4}$' THEN (e.x->>'teamId')::smallint END,
  CASE WHEN e.x->>'kills' ~ '^-?[0-9]{1,4}$' THEN (e.x->>'kills')::smallint END,
  (SELECT CASE WHEN t->'objectives'->>'champion' ~ '^-?[0-9]{1,4}$' THEN (t->'objectives'->>'champion')::smallint END
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(md.teams) = 'array' THEN md.teams ELSE '[]'::jsonb END) AS t
     WHERE t->>'teamId' = e.x->>'teamId' LIMIT 1),
  (e.x->'stats'->>'doubleKills')::smallint, (e.x->'stats'->>'tripleKills')::smallint,
  (e.x->'stats'->>'quadraKills')::smallint, (e.x->'stats'->>'pentaKills')::smallint,
  CASE WHEN e.x->'stats'->>'largestMultiKill' ~ '^-?[0-9]{1,4}$' THEN (e.x->'stats'->>'largestMultiKill')::smallint END
FROM public.match_details md
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(md.participants) = 'array' THEN md.participants ELSE '[]'::jsonb END) WITH ORDINALITY AS e(x, i)
WHERE e.x->>'removed' IS NULL
  AND jsonb_typeof(e.x->'stats'->'doubleKills') = 'number' AND jsonb_typeof(e.x->'stats'->'tripleKills') = 'number'
  AND jsonb_typeof(e.x->'stats'->'quadraKills') = 'number' AND jsonb_typeof(e.x->'stats'->'pentaKills') = 'number'
  AND (e.x->'stats'->>'doubleKills') ~ '^-?[0-9]{1,4}$' AND (e.x->'stats'->>'tripleKills') ~ '^-?[0-9]{1,4}$'
  AND (e.x->'stats'->>'quadraKills') ~ '^-?[0-9]{1,4}$' AND (e.x->'stats'->>'pentaKills') ~ '^-?[0-9]{1,4}$'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- So the planner knows the new table's size at once (the comparison's plan depends on it).
ANALYZE public.match_multikills;
--> statement-breakpoint
ALTER TABLE "match_multikills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Closed to Supabase's Data API whatever the project's default privileges, and readable by the
-- backup role where it exists (docs/DATABASE_PERMISSIONS.md). No serial column, so no sequence.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.match_multikills FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.match_multikills FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniiverse_backup') THEN
    GRANT SELECT ON TABLE public.match_multikills TO uniiverse_backup;
  END IF;
END $$;
