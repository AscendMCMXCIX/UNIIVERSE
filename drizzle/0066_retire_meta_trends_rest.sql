-- Drops what was left of Meta & Trends and deletes the other players' ranks no stored game names.
-- Tables (nothing has read or written them since the feature was removed on 19 Oct 2026; 0062 dropped
-- the other 12): tracked_summoners (the ladder players; 0048 copied the ranks Match History shows
-- into last_known_ranks), region_status (the collection's per-region state), stat_periods,
-- stat_region_periods and stat_rank_periods (the aggregation's periods) with stat_source, the enum
-- type only they used, and champion_change_points (rework discounts).
-- Ranks: last_known_ranks rows whose player is in no stored game (the ladder's and the Draft's
-- sightings 0048 copied, and lookups whose games are gone). A rank is only ever shown for a player
-- in a stored game, so nothing on any page changes. Data jobs db-usage counts them ("lastKnownRanks").
-- Held until, and only after, all of these:
--   1. the owner has independently verified an encrypted backup that holds these tables and
--      last_known_ranks (docs/BACKUPS.md: restored and counted) and secured an offline copy;
--   2. Data jobs db-usage, "retired", twice a day apart: no new writes to these tables, and no
--      dependent outside them;
--   3. the owner's explicit go-ahead to delete this data.
-- No CASCADE: each table goes after anything that references it (champion_change_points references
-- champions, which stays), so a dependency nobody expected makes this migration fail instead of
-- being dropped with them. Recovery: pg_restore --table (and the last_known_ranks rows) from that
-- backup, then revert this change.
DROP TABLE "champion_change_points";--> statement-breakpoint
DROP TABLE "stat_rank_periods";--> statement-breakpoint
DROP TABLE "stat_region_periods";--> statement-breakpoint
DROP TABLE "stat_periods";--> statement-breakpoint
DROP TYPE "public"."stat_source";--> statement-breakpoint
DROP TABLE "region_status";--> statement-breakpoint
DROP TABLE "tracked_summoners";--> statement-breakpoint
WITH stored AS (SELECT DISTINCT jsonb_array_elements_text(jsonb_path_query_array("participants", '$[*].puuid')) AS puuid FROM "match_details")
DELETE FROM "last_known_ranks" l WHERE NOT EXISTS (SELECT 1 FROM stored s WHERE s.puuid = l.puuid);
