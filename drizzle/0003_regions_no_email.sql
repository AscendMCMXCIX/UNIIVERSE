CREATE TABLE "region_status" (
	"platform" text PRIMARY KEY NOT NULL,
	"last_league_refresh_at" timestamp with time zone,
	"last_discover_at" timestamp with time zone,
	"last_ingest_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"consecutive_errors" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stat_region_periods" (
	"patch" text NOT NULL,
	"source" "stat_source" NOT NULL,
	"platform" text NOT NULL,
	"queue_id" integer DEFAULT 420 NOT NULL,
	"tier_population" text DEFAULT 'MASTER+' NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"first_game_at" timestamp with time zone,
	"last_game_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stat_region_periods_patch_source_platform_pk" PRIMARY KEY("patch","source","platform")
);
--> statement-breakpoint
DROP INDEX IF EXISTS "users_email_idx";--> statement-breakpoint
ALTER TABLE "riot_accounts" ADD COLUMN "platform_source" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "riot_accounts" ADD COLUMN "puuid_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "riot_accounts" ADD COLUMN "resolve_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "ranked_matches_platform_patch_idx" ON "ranked_matches" USING btree ("platform","patch");--> statement-breakpoint
ALTER TABLE "invites" DROP COLUMN IF EXISTS "email";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "email";