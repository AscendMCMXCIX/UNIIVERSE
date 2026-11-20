CREATE TABLE "account_match_prep" (
	"account_id" uuid NOT NULL,
	"match_id" text NOT NULL,
	"format" integer NOT NULL,
	"prep" jsonb NOT NULL,
	"made_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_match_prep_account_id_match_id_pk" PRIMARY KEY("account_id","match_id")
);
--> statement-breakpoint
CREATE TABLE "static_digests" (
	"patch" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"hash" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "static_digests_patch_kind_key_pk" PRIMARY KEY("patch","kind","key")
);
--> statement-breakpoint
ALTER TABLE "account_match_prep" ADD CONSTRAINT "account_match_prep_game_fk" FOREIGN KEY ("account_id","match_id") REFERENCES "public"."account_matches"("account_id","match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_match_prep_vs_idx" ON "account_match_prep" USING btree (("prep"->>'vs'));--> statement-breakpoint
ALTER TABLE "account_match_prep" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "static_digests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Closed to Supabase's Data API whatever the project's default privileges, and readable by the
-- backup role where it exists (docs/DATABASE_PERMISSIONS.md).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.account_match_prep FROM anon;
    REVOKE ALL ON TABLE public.static_digests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.account_match_prep FROM authenticated;
    REVOKE ALL ON TABLE public.static_digests FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniiverse_backup') THEN
    GRANT SELECT ON TABLE public.account_match_prep TO uniiverse_backup;
    GRANT SELECT ON TABLE public.static_digests TO uniiverse_backup;
  END IF;
END $$;
