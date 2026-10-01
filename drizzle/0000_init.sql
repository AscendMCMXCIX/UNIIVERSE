CREATE TYPE "public"."action_type" AS ENUM('ban', 'pick');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."player_group" AS ENUM('main', 'other');--> statement-breakpoint
CREATE TYPE "public"."pool_slot" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TYPE "public"."refresh_status" AS ENUM('never', 'ok', 'degraded', 'failed', 'running');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('blue', 'red');--> statement-breakpoint
CREATE TYPE "public"."stat_source" AS ENUM('ranked', 'pro', 'demo');--> statement-breakpoint
CREATE TABLE "champion_change_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"champion_id" text NOT NULL,
	"patch" text NOT NULL,
	"discount" real DEFAULT 0.15 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"confirmed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "champions" (
	"id" text PRIMARY KEY NOT NULL,
	"key" integer NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attack_range" integer DEFAULT 125 NOT NULL,
	"info" jsonb DEFAULT '{"attack":0,"defense":0,"magic":0,"difficulty":0}'::jsonb NOT NULL,
	"partype" text DEFAULT '' NOT NULL,
	"image_full" text NOT NULL,
	"first_seen_version" text NOT NULL,
	"last_seen_version" text NOT NULL,
	"fingerprint" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'ddragon' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patches" (
	"id" text PRIMARY KEY NOT NULL,
	"ddragon_version" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sort_key" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineup_slots" (
	"lineup_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"player_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text DEFAULT 'Active lineup' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_champion_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"slot" "pool_slot" NOT NULL,
	"champion_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"riot_id" text,
	"primary_role" "role" NOT NULL,
	"secondary_role" "role",
	"notes" text DEFAULT '' NOT NULL,
	"group" "player_group" DEFAULT 'main' NOT NULL,
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"primary_pool_limit" integer DEFAULT 6 NOT NULL,
	"secondary_pool_limit" integer DEFAULT 2 NOT NULL,
	"engine_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"draft_id" uuid NOT NULL,
	"sequence_index" integer NOT NULL,
	"type" "action_type" NOT NULL,
	"side" "side" NOT NULL,
	"champion_id" text,
	"player_id" uuid,
	"role" "role",
	"recommendation_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_role_swaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"draft_id" uuid NOT NULL,
	"after_sequence_index" integer NOT NULL,
	"assignments" jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"opponent_name" text DEFAULT '' NOT NULL,
	"side" "side" NOT NULL,
	"patch" text NOT NULL,
	"status" "draft_status" DEFAULT 'in_progress' NOT NULL,
	"lineup_snapshot" jsonb NOT NULL,
	"initial_assignments" jsonb NOT NULL,
	"current_assignments" jsonb NOT NULL,
	"unavailable_champion_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"final_analysis" jsonb,
	"notes" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_fetch_queue" (
	"match_id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranked_bans" (
	"match_id" text NOT NULL,
	"team_id" integer NOT NULL,
	"pick_turn" integer NOT NULL,
	"champion_key" integer NOT NULL,
	CONSTRAINT "ranked_bans_match_id_team_id_pick_turn_pk" PRIMARY KEY("match_id","team_id","pick_turn")
);
--> statement-breakpoint
CREATE TABLE "ranked_matches" (
	"match_id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"game_version" text NOT NULL,
	"patch" text NOT NULL,
	"queue_id" integer NOT NULL,
	"game_creation" bigint NOT NULL,
	"game_duration" integer NOT NULL,
	"winning_team_id" integer NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aggregated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ranked_participants" (
	"match_id" text NOT NULL,
	"puuid" text NOT NULL,
	"team_id" integer NOT NULL,
	"champion_key" integer NOT NULL,
	"champion_id" text,
	"position" text NOT NULL,
	"win" boolean NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ranked_participants_match_id_puuid_pk" PRIMARY KEY("match_id","puuid")
);
--> statement-breakpoint
CREATE TABLE "tracked_summoners" (
	"puuid" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"tier" text NOT NULL,
	"league_points" integer DEFAULT 0 NOT NULL,
	"last_seen_in_league_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_match_list_at" timestamp with time zone,
	"match_list_cursor" bigint
);
--> statement-breakpoint
CREATE TABLE "pro_game_bans" (
	"game_id" text NOT NULL,
	"side" "side" NOT NULL,
	"ban_order" integer NOT NULL,
	"champion_id" text NOT NULL,
	CONSTRAINT "pro_game_bans_game_id_side_ban_order_pk" PRIMARY KEY("game_id","side","ban_order")
);
--> statement-breakpoint
CREATE TABLE "pro_game_picks" (
	"game_id" text NOT NULL,
	"side" "side" NOT NULL,
	"role" "role" NOT NULL,
	"champion_id" text NOT NULL,
	"pick_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pro_game_picks_game_id_side_role_pk" PRIMARY KEY("game_id","side","role")
);
--> statement-breakpoint
CREATE TABLE "pro_games" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"tournament" text DEFAULT '' NOT NULL,
	"league" text DEFAULT '' NOT NULL,
	"patch" text NOT NULL,
	"played_at" timestamp with time zone,
	"blue_team" text DEFAULT '' NOT NULL,
	"red_team" text DEFAULT '' NOT NULL,
	"winner_side" "side",
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aggregated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "champion_ban_stats" (
	"patch" text NOT NULL,
	"source" "stat_source" NOT NULL,
	"champion_id" text NOT NULL,
	"bans" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "champion_ban_stats_patch_source_champion_id_pk" PRIMARY KEY("patch","source","champion_id")
);
--> statement-breakpoint
CREATE TABLE "champion_matchups" (
	"patch" text NOT NULL,
	"source" "stat_source" NOT NULL,
	"champion_id" text NOT NULL,
	"role" "role" NOT NULL,
	"enemy_champion_id" text NOT NULL,
	"enemy_role" "role" NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "champion_matchups_patch_source_champion_id_role_enemy_champion_id_enemy_role_pk" PRIMARY KEY("patch","source","champion_id","role","enemy_champion_id","enemy_role")
);
--> statement-breakpoint
CREATE TABLE "champion_role_stats" (
	"patch" text NOT NULL,
	"source" "stat_source" NOT NULL,
	"champion_id" text NOT NULL,
	"role" "role" NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "champion_role_stats_patch_source_champion_id_role_pk" PRIMARY KEY("patch","source","champion_id","role")
);
--> statement-breakpoint
CREATE TABLE "champion_synergies" (
	"patch" text NOT NULL,
	"source" "stat_source" NOT NULL,
	"champion_a_id" text NOT NULL,
	"role_a" "role" NOT NULL,
	"champion_b_id" text NOT NULL,
	"role_b" "role" NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "champion_synergies_patch_source_champion_a_id_role_a_champion_b_id_role_b_pk" PRIMARY KEY("patch","source","champion_a_id","role_a","champion_b_id","role_b")
);
--> statement-breakpoint
CREATE TABLE "stat_periods" (
	"patch" text NOT NULL,
	"source" "stat_source" NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"first_game_at" timestamp with time zone,
	"last_game_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stat_periods_patch_source_pk" PRIMARY KEY("patch","source")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_refresh_status" (
	"key" text PRIMARY KEY NOT NULL,
	"status" "refresh_status" DEFAULT 'never' NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error" text,
	"last_duration_ms" integer,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" text,
	"duration_ms" integer,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"trigger" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "champion_change_points" ADD CONSTRAINT "champion_change_points_champion_id_champions_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."champions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_slots" ADD CONSTRAINT "lineup_slots_lineup_id_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_slots" ADD CONSTRAINT "lineup_slots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_champion_pools" ADD CONSTRAINT "player_champion_pools_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_champion_pools" ADD CONSTRAINT "player_champion_pools_champion_id_champions_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."champions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_actions" ADD CONSTRAINT "draft_actions_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_role_swaps" ADD CONSTRAINT "draft_role_swaps_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_bans" ADD CONSTRAINT "ranked_bans_match_id_ranked_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."ranked_matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_participants" ADD CONSTRAINT "ranked_participants_match_id_ranked_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."ranked_matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_game_bans" ADD CONSTRAINT "pro_game_bans_game_id_pro_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."pro_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_game_picks" ADD CONSTRAINT "pro_game_picks_game_id_pro_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."pro_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "champions_key_idx" ON "champions" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "lineup_role_idx" ON "lineup_slots" USING btree ("lineup_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "lineup_player_idx" ON "lineup_slots" USING btree ("lineup_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_player_slot_champion_idx" ON "player_champion_pools" USING btree ("player_id","slot","champion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_action_sequence_idx" ON "draft_actions" USING btree ("draft_id","sequence_index");--> statement-breakpoint
CREATE INDEX "queue_status_idx" ON "match_fetch_queue" USING btree ("status","discovered_at");--> statement-breakpoint
CREATE INDEX "ranked_matches_patch_idx" ON "ranked_matches" USING btree ("patch");--> statement-breakpoint
CREATE INDEX "ranked_matches_aggregated_idx" ON "ranked_matches" USING btree ("aggregated_at");--> statement-breakpoint
CREATE INDEX "participants_champion_idx" ON "ranked_participants" USING btree ("champion_key");--> statement-breakpoint
CREATE INDEX "tracked_platform_idx" ON "tracked_summoners" USING btree ("platform","last_match_list_at");--> statement-breakpoint
CREATE INDEX "pro_games_patch_idx" ON "pro_games" USING btree ("patch");--> statement-breakpoint
CREATE INDEX "pro_games_aggregated_idx" ON "pro_games" USING btree ("aggregated_at");--> statement-breakpoint
CREATE INDEX "matchups_champion_idx" ON "champion_matchups" USING btree ("patch","source","champion_id","role");--> statement-breakpoint
CREATE INDEX "crs_patch_source_idx" ON "champion_role_stats" USING btree ("patch","source");--> statement-breakpoint
CREATE INDEX "synergies_a_idx" ON "champion_synergies" USING btree ("patch","source","champion_a_id");--> statement-breakpoint
CREATE INDEX "synergies_b_idx" ON "champion_synergies" USING btree ("patch","source","champion_b_id");