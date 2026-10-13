CREATE TYPE "public"."series_status" AS ENUM('in_progress', 'completed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."competition_mode" ADD VALUE 'practice' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"remember" boolean DEFAULT false NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"mode" "competition_mode" DEFAULT 'tournament' NOT NULL,
	"event_name" text DEFAULT '' NOT NULL,
	"opponent_name" text DEFAULT '' NOT NULL,
	"best_of" integer DEFAULT 1 NOT NULL,
	"status" "series_status" DEFAULT 'in_progress' NOT NULL,
	"our_wins" integer DEFAULT 0 NOT NULL,
	"their_wins" integer DEFAULT 0 NOT NULL,
	"winner" text,
	"notes" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "secondary_pool_limit" SET DEFAULT 3;--> statement-breakpoint
UPDATE "teams" SET "secondary_pool_limit" = 3 WHERE "secondary_pool_limit" = 2;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "game_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "enemy_players" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
UPDATE "users" SET "username" = COALESCE(NULLIF(btrim("display_name"), ''), NULLIF(split_part(COALESCE("email", ''), '@', 1), ''), 'user') WHERE "username" IS NULL;--> statement-breakpoint
UPDATE "users" u SET "username" = u."username" || '-' || r.n FROM (SELECT id, row_number() OVER (PARTITION BY lower("username") ORDER BY created_at, id) AS n FROM "users") r WHERE r.id = u.id AND r.n > 1;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "game_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "enemy_players" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "series_team_created_idx" ON "series" USING btree ("team_id","created_at");--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "matches_series_idx" ON "matches" USING btree ("series_id");