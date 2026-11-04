-- Drops what the removed Draft feature left in the database (audit decision 3): its nine tables,
-- riot_accounts.opponent_player_id, teams.engine_config and the six enum types only they used.
-- Nothing has read or written them since migration 0048 copied the scouted ranks Match History
-- shows into last_known_ranks. The owner approved this on 19 Oct 2026, together with decision 2;
-- it merges only after a verified backup that holds them (docs/BACKUPS.md: restored and counted).
-- Kept: team_bookmarks (Team Matches), every riot_accounts row (only the opponent link goes) and
-- every other table. No CASCADE: the two columns go first (a column takes its own index and foreign
-- key with it), then each table after the tables that reference it, then the types, so a
-- dependency nobody expected makes this migration fail instead of being dropped with them.
-- Recovery: pg_restore --table from that backup, then revert this change.
ALTER TABLE "riot_accounts" DROP COLUMN "opponent_player_id";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "engine_config";--> statement-breakpoint
DROP TABLE "draft_actions";--> statement-breakpoint
DROP TABLE "draft_role_swaps";--> statement-breakpoint
DROP TABLE "draft_presence";--> statement-breakpoint
DROP TABLE "draft_enemy_scouting";--> statement-breakpoint
DROP TABLE "matches";--> statement-breakpoint
DROP TABLE "drafts";--> statement-breakpoint
DROP TABLE "series";--> statement-breakpoint
DROP TABLE "opponent_players";--> statement-breakpoint
DROP TABLE "opponent_teams";--> statement-breakpoint
DROP TYPE "public"."action_type";--> statement-breakpoint
DROP TYPE "public"."competition_mode";--> statement-breakpoint
DROP TYPE "public"."draft_status";--> statement-breakpoint
DROP TYPE "public"."match_result";--> statement-breakpoint
DROP TYPE "public"."scouting_confidence";--> statement-breakpoint
DROP TYPE "public"."series_status";
