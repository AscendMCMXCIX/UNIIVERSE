CREATE TABLE "high_elo_counts" (
	"champion" text NOT NULL,
	"patch" text NOT NULL,
	"role" text NOT NULL,
	"region" text NOT NULL,
	"opponent" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"n" integer NOT NULL,
	"w" double precision NOT NULL,
	"w2" double precision NOT NULL,
	"ww" double precision NOT NULL,
	"wx" double precision DEFAULT 0 NOT NULL,
	"wx2" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "high_elo_counts_pk" PRIMARY KEY("champion","patch","role","region","opponent","kind","value")
);
--> statement-breakpoint
CREATE TABLE "high_elo_cursors" (
	"platform" text PRIMARY KEY NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"games" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "high_elo_population" (
	"platform" text PRIMARY KEY NOT NULL,
	"challenger" integer NOT NULL,
	"grandmaster" integer NOT NULL,
	"master" integer NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "high_elo_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "high_elo_cursors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "high_elo_population" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Closed to Supabase's Data API whatever the project's default privileges, and readable by the
-- backup role where it exists (docs/DATABASE_PERMISSIONS.md). No serial column: no sequence lines.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.high_elo_counts FROM anon;
    REVOKE ALL ON TABLE public.high_elo_cursors FROM anon;
    REVOKE ALL ON TABLE public.high_elo_population FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.high_elo_counts FROM authenticated;
    REVOKE ALL ON TABLE public.high_elo_cursors FROM authenticated;
    REVOKE ALL ON TABLE public.high_elo_population FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniiverse_backup') THEN
    GRANT SELECT ON TABLE public.high_elo_counts TO uniiverse_backup;
    GRANT SELECT ON TABLE public.high_elo_cursors TO uniiverse_backup;
    GRANT SELECT ON TABLE public.high_elo_population TO uniiverse_backup;
  END IF;
END $$;
