CREATE TABLE "matchup_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"role" text NOT NULL,
	"opponent_id" text NOT NULL,
	"champion_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"points" jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_patch" text,
	"reviewed_version" text,
	"kit_hashes" jsonb,
	"ability_hashes" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matchup_notes_scope_check" CHECK ("matchup_notes"."scope" IN ('opponent', 'pair') AND (("matchup_notes"."scope" = 'pair') = ("matchup_notes"."champion_id" IS NOT NULL))),
	CONSTRAINT "matchup_notes_role_check" CHECK ("matchup_notes"."role" IN ('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT')),
	CONSTRAINT "matchup_notes_status_check" CHECK ("matchup_notes"."status" IN ('draft', 'published', 'retired')),
	CONSTRAINT "matchup_notes_review_check" CHECK ("matchup_notes"."status" <> 'published' OR ("matchup_notes"."reviewed_at" IS NOT NULL AND "matchup_notes"."reviewed_patch" IS NOT NULL AND "matchup_notes"."kit_hashes" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "matchup_notes" ADD CONSTRAINT "matchup_notes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchup_notes" ADD CONSTRAINT "matchup_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchup_notes" ADD CONSTRAINT "matchup_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "matchup_notes_live_idx" ON "matchup_notes" USING btree ("scope","role","opponent_id",coalesce("champion_id", '')) WHERE "matchup_notes"."status" <> 'retired';--> statement-breakpoint
CREATE INDEX "matchup_notes_read_idx" ON "matchup_notes" USING btree ("role","opponent_id") WHERE "matchup_notes"."status" = 'published';--> statement-breakpoint
ALTER TABLE "matchup_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Closed to Supabase's Data API whatever the project's default privileges, and readable by the
-- backup role where it exists (docs/DATABASE_PERMISSIONS.md). A uuid key: no sequence to grant.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.matchup_notes FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.matchup_notes FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniiverse_backup') THEN
    GRANT SELECT ON TABLE public.matchup_notes TO uniiverse_backup;
  END IF;
END $$;
