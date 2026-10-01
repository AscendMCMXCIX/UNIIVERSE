CREATE TYPE "public"."account_owner" AS ENUM('player', 'opponent');--> statement-breakpoint
CREATE TYPE "public"."competition_mode" AS ENUM('ranked-flex', 'clash', 'scrim', 'tournament', 'custom', 'other');--> statement-breakpoint
CREATE TYPE "public"."match_result" AS ENUM('win', 'loss', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scouting_confidence" AS ENUM('high', 'medium', 'low', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'coach', 'player');--> statement-breakpoint
CREATE TABLE "draft_presence" (
	"draft_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid,
	"label" text DEFAULT '' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_presence_draft_id_client_id_pk" PRIMARY KEY("draft_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "pro_pick_slot_stats" (
	"patch" text NOT NULL,
	"champion_id" text NOT NULL,
	"slot" text NOT NULL,
	"role" "role",
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_pick_slot_stats_patch_champion_id_slot_pk" PRIMARY KEY("patch","champion_id","slot")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"role" "user_role" DEFAULT 'player' NOT NULL,
	"player_id" uuid,
	"email" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'player' NOT NULL,
	"player_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opponent_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opponent_team_id" uuid NOT NULL,
	"label" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"likely_role" "role",
	"alt_role" "role",
	"confidence" "scouting_confidence" DEFAULT 'unknown' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opponent_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_champion_history" (
	"account_id" uuid NOT NULL,
	"champion_id" text NOT NULL,
	"role" text DEFAULT 'UNKNOWN' NOT NULL,
	"queue_group" text DEFAULT 'other' NOT NULL,
	"patch" text NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp with time zone,
	CONSTRAINT "account_champion_history_account_id_champion_id_role_queue_group_patch_pk" PRIMARY KEY("account_id","champion_id","role","queue_group","patch")
);
--> statement-breakpoint
CREATE TABLE "account_mastery" (
	"account_id" uuid NOT NULL,
	"champion_id" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp with time zone,
	CONSTRAINT "account_mastery_account_id_champion_id_pk" PRIMARY KEY("account_id","champion_id")
);
--> statement-breakpoint
CREATE TABLE "account_matches" (
	"account_id" uuid NOT NULL,
	"match_id" text NOT NULL,
	"game_creation" bigint NOT NULL,
	CONSTRAINT "account_matches_account_id_match_id_pk" PRIMARY KEY("account_id","match_id")
);
--> statement-breakpoint
CREATE TABLE "riot_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "account_owner" NOT NULL,
	"player_id" uuid,
	"opponent_player_id" uuid,
	"game_name" text NOT NULL,
	"tag_line" text NOT NULL,
	"platform" text NOT NULL,
	"puuid" text,
	"label" text DEFAULT 'main' NOT NULL,
	"role" "role",
	"tier" text,
	"division" text,
	"league_points" integer,
	"ranked_wins" integer,
	"ranked_losses" integer,
	"rank_updated_at" timestamp with time zone,
	"sync_cursor" bigint,
	"last_sync_at" timestamp with time zone,
	"sync_status" text DEFAULT 'never' NOT NULL,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"draft_id" uuid,
	"mode" "competition_mode" DEFAULT 'other' NOT NULL,
	"event_name" text DEFAULT '' NOT NULL,
	"patch" text NOT NULL,
	"side" "side" NOT NULL,
	"lineup_snapshot" jsonb NOT NULL,
	"final_assignments" jsonb NOT NULL,
	"our_bans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enemy_bans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"our_picks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enemy_picks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opponent_team_id" uuid,
	"opponent_name" text DEFAULT '' NOT NULL,
	"playbook" jsonb,
	"result" "match_result",
	"duration_seconds" integer,
	"riot_match_id" text,
	"riot_info" jsonb,
	"notes" text DEFAULT '' NOT NULL,
	"vod_url" text DEFAULT '' NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "is_saved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "mode" "competition_mode" DEFAULT 'tournament' NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "format_id" text DEFAULT 'tournament' NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "format_spec" jsonb;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "is_theorycraft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "event_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "opponent_team_id" uuid;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "controller_user_id" uuid;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "draft_presence" ADD CONSTRAINT "draft_presence_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opponent_players" ADD CONSTRAINT "opponent_players_opponent_team_id_opponent_teams_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."opponent_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opponent_teams" ADD CONSTRAINT "opponent_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_champion_history" ADD CONSTRAINT "account_champion_history_account_id_riot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_mastery" ADD CONSTRAINT "account_mastery_account_id_riot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_matches" ADD CONSTRAINT "account_matches_account_id_riot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot_accounts" ADD CONSTRAINT "riot_accounts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot_accounts" ADD CONSTRAINT "riot_accounts_opponent_player_id_opponent_players_id_fk" FOREIGN KEY ("opponent_player_id") REFERENCES "public"."opponent_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_opponent_team_id_opponent_teams_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."opponent_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_idx" ON "invites" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_player_idx" ON "users" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "riot_accounts_puuid_idx" ON "riot_accounts" USING btree ("puuid");--> statement-breakpoint
CREATE UNIQUE INDEX "riot_accounts_riot_id_idx" ON "riot_accounts" USING btree ("platform","game_name","tag_line");--> statement-breakpoint
CREATE INDEX "riot_accounts_player_idx" ON "riot_accounts" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "riot_accounts_opponent_idx" ON "riot_accounts" USING btree ("opponent_player_id");--> statement-breakpoint
CREATE INDEX "matches_team_played_idx" ON "matches" USING btree ("team_id","played_at");--> statement-breakpoint
CREATE INDEX "matches_opponent_idx" ON "matches" USING btree ("opponent_team_id");