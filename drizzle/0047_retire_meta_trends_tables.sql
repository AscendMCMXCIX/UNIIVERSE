-- Drops the 12 tables Meta & Trends left behind (audit decision 2, about 206 MB of the database).
-- Nothing has read or written them since the feature was removed, and no live table references
-- them. The owner approved this on 19 Oct 2026 on two conditions, checked before it merges:
--   1. a verified backup that holds these tables (docs/BACKUPS.md: restored and counted);
--   2. no reads of them over at least a day (Data jobs db-usage scan counters unchanged).
-- Kept: tracked_summoners (Match History reads it), region_status, champion_change_points and
-- the stat_*_periods tables (not part of this decision). No CASCADE: a dependency nobody expected
-- makes this migration fail instead of being dropped with them. Recovery: pg_restore --table
-- from that backup, then revert this change.
DROP TABLE "ranked_participants";--> statement-breakpoint
DROP TABLE "ranked_bans";--> statement-breakpoint
DROP TABLE "ranked_matches";--> statement-breakpoint
DROP TABLE "match_fetch_queue";--> statement-breakpoint
DROP TABLE "pro_game_picks";--> statement-breakpoint
DROP TABLE "pro_game_bans";--> statement-breakpoint
DROP TABLE "pro_games";--> statement-breakpoint
DROP TABLE "champion_matchups";--> statement-breakpoint
DROP TABLE "champion_synergies";--> statement-breakpoint
DROP TABLE "champion_role_stats";--> statement-breakpoint
DROP TABLE "champion_ban_stats";--> statement-breakpoint
DROP TABLE "pro_pick_slot_stats";
