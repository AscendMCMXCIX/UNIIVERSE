CREATE TABLE "draft_enemy_scouting" (
	"draft_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"riot_id" text NOT NULL,
	"platform" text,
	"puuid" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"tier" text,
	"division" text,
	"league_points" integer,
	"ranked_wins" integer,
	"ranked_losses" integer,
	"champions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"games_analysed" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_enemy_scouting_draft_id_role_pk" PRIMARY KEY("draft_id","role")
);
--> statement-breakpoint
CREATE TABLE "stat_rank_periods" (
	"patch" text NOT NULL,
	"source" "stat_source" NOT NULL,
	"tier_band" text NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"first_game_at" timestamp with time zone,
	"last_game_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stat_rank_periods_patch_source_tier_band_pk" PRIMARY KEY("patch","source","tier_band")
);
--> statement-breakpoint
CREATE TABLE "ranked_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranked_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"account_id" uuid,
	"riot_match_id" text,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" "role",
	"champion_id" text NOT NULL,
	"enemy_champion_id" text,
	"result" text NOT NULL,
	"main_mistake" text,
	"notes" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"teammate_player_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranked_profiles" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"champion_1" text,
	"champion_2" text,
	"champion_3" text,
	"counter_pick" text,
	"focus" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_fetch_queue" ADD COLUMN "tier_band" text;
--> statement-breakpoint
ALTER TABLE "ranked_matches" ADD COLUMN "tier_band" text;
--> statement-breakpoint
ALTER TABLE "champion_ban_stats" ADD COLUMN "tier_band" text DEFAULT 'MASTER+' NOT NULL;
--> statement-breakpoint
ALTER TABLE "champion_matchups" ADD COLUMN "tier_band" text DEFAULT 'MASTER+' NOT NULL;
--> statement-breakpoint
ALTER TABLE "champion_role_stats" ADD COLUMN "tier_band" text DEFAULT 'MASTER+' NOT NULL;
--> statement-breakpoint
ALTER TABLE "champion_synergies" ADD COLUMN "tier_band" text DEFAULT 'MASTER+' NOT NULL;
--> statement-breakpoint
ALTER TABLE "champion_ban_stats" DROP CONSTRAINT "champion_ban_stats_patch_source_champion_id_pk";
--> statement-breakpoint
ALTER TABLE "champion_matchups" DROP CONSTRAINT "champion_matchups_patch_source_champion_id_role_enemy_champion_id_enemy_role_pk";
--> statement-breakpoint
ALTER TABLE "champion_role_stats" DROP CONSTRAINT "champion_role_stats_patch_source_champion_id_role_pk";
--> statement-breakpoint
ALTER TABLE "champion_synergies" DROP CONSTRAINT "champion_synergies_patch_source_champion_a_id_role_a_champion_b_id_role_b_pk";
--> statement-breakpoint
ALTER TABLE "champion_ban_stats" ADD CONSTRAINT "champion_ban_stats_patch_source_tier_band_champion_id_pk" PRIMARY KEY("patch","source","tier_band","champion_id");
--> statement-breakpoint
ALTER TABLE "champion_matchups" ADD CONSTRAINT "champion_matchups_patch_source_tier_band_champion_id_role_enemy_champion_id_enemy_role_pk" PRIMARY KEY("patch","source","tier_band","champion_id","role","enemy_champion_id","enemy_role");
--> statement-breakpoint
ALTER TABLE "champion_role_stats" ADD CONSTRAINT "champion_role_stats_patch_source_tier_band_champion_id_role_pk" PRIMARY KEY("patch","source","tier_band","champion_id","role");
--> statement-breakpoint
ALTER TABLE "champion_synergies" ADD CONSTRAINT "champion_synergies_patch_source_tier_band_champion_a_id_role_a_champion_b_id_role_b_pk" PRIMARY KEY("patch","source","tier_band","champion_a_id","role_a","champion_b_id","role_b");
--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "queue_id" integer;
--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "champion_id" text;
--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "role" text;
--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "win" boolean;
--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "enemy_champion_id" text;
--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "patch" text;
--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "game_duration" integer;
--> statement-breakpoint
ALTER TABLE "draft_enemy_scouting" ADD CONSTRAINT "draft_enemy_scouting_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD CONSTRAINT "ranked_blocks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ranked_games" ADD CONSTRAINT "ranked_games_block_id_ranked_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."ranked_blocks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ranked_games" ADD CONSTRAINT "ranked_games_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ranked_games" ADD CONSTRAINT "ranked_games_account_id_riot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ranked_games" ADD CONSTRAINT "ranked_games_teammate_player_id_players_id_fk" FOREIGN KEY ("teammate_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ranked_profiles" ADD CONSTRAINT "ranked_profiles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "draft_enemy_scouting_puuid_idx" ON "draft_enemy_scouting" USING btree ("puuid","fetched_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ranked_blocks_player_number_idx" ON "ranked_blocks" USING btree ("player_id","number");
--> statement-breakpoint
CREATE INDEX "ranked_blocks_player_status_idx" ON "ranked_blocks" USING btree ("player_id","status");
--> statement-breakpoint
CREATE INDEX "ranked_games_block_idx" ON "ranked_games" USING btree ("block_id");
--> statement-breakpoint
CREATE INDEX "ranked_games_player_played_idx" ON "ranked_games" USING btree ("player_id","played_at");
--> statement-breakpoint
CREATE INDEX "ranked_games_teammate_idx" ON "ranked_games" USING btree ("teammate_player_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ranked_games_player_match_idx" ON "ranked_games" USING btree ("player_id","riot_match_id");
--> statement-breakpoint
CREATE INDEX "account_matches_recent_idx" ON "account_matches" USING btree ("account_id","game_creation");
