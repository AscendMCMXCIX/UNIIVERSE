CREATE TABLE "mi_high_counts" (
	"patch" text NOT NULL,
	"region" text NOT NULL,
	"role" text NOT NULL,
	"champion" text NOT NULL,
	"opponent" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"n" integer NOT NULL,
	"w" double precision NOT NULL,
	"w2" double precision NOT NULL,
	"ww" double precision NOT NULL,
	CONSTRAINT "mi_high_counts_patch_region_role_champion_opponent_kind_value_pk" PRIMARY KEY("patch","region","role","champion","opponent","kind","value")
);
--> statement-breakpoint
CREATE TABLE "mi_high_cursors" (
	"platform" text PRIMARY KEY NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"games" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mi_high_population" (
	"platform" text PRIMARY KEY NOT NULL,
	"challenger" integer NOT NULL,
	"grandmaster" integer NOT NULL,
	"master" integer NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mi_high_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mi_high_cursors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mi_high_population" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Closed to Supabase's Data API whatever the project's default privileges, and readable by the
-- backup role where it exists (docs/DATABASE_PERMISSIONS.md).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.mi_high_counts FROM anon;
    REVOKE ALL ON TABLE public.mi_high_cursors FROM anon;
    REVOKE ALL ON TABLE public.mi_high_population FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.mi_high_counts FROM authenticated;
    REVOKE ALL ON TABLE public.mi_high_cursors FROM authenticated;
    REVOKE ALL ON TABLE public.mi_high_population FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniiverse_backup') THEN
    GRANT SELECT ON TABLE public.mi_high_counts TO uniiverse_backup;
    GRANT SELECT ON TABLE public.mi_high_cursors TO uniiverse_backup;
    GRANT SELECT ON TABLE public.mi_high_population TO uniiverse_backup;
  END IF;
END $$;
