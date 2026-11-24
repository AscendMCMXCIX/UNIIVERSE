-- Drops what was left of Meta & Trends and deletes the other players' ranks no stored game names
-- (PR #212's migration 0066, held since 7 Nov 2026 and approved by the owner on 24 Nov 2026; numbered
-- 0068 because 0067 came first and drizzle's snapshots chain from it).
-- Tables (nothing has read or written them since the feature was removed on 19 Oct 2026; 0062 dropped
-- the other 12): tracked_summoners (the ladder players; 0048 copied the ranks Match History shows
-- into last_known_ranks), region_status (the collection's per-region state), stat_periods,
-- stat_region_periods and stat_rank_periods (the aggregation's periods) with stat_source, the enum
-- type only they used, and champion_change_points (rework discounts).
-- Ranks: last_known_ranks rows whose player is in no stored game (the ladder's and the Draft's
-- sightings 0048 copied, and lookups whose games are gone). A rank is only ever read for a player a
-- stored game names (server/players/participant-ranks.ts), so nothing on any page changes. Data jobs
-- db-usage counts them ("lastKnownRanks").
-- No CASCADE (drizzle-kit writes it; removed here): each table goes after anything that references it
-- (champion_change_points references champions, which stays), so a dependency nobody expected makes
-- this migration fail instead of being dropped with them. Recovery: pg_restore --table (and the
-- last_known_ranks rows) from the private backup taken before it, then revert this change
-- (docs/BACKUPS.md).
DROP TABLE "champion_change_points";--> statement-breakpoint
DROP TABLE "stat_rank_periods";--> statement-breakpoint
DROP TABLE "stat_region_periods";--> statement-breakpoint
DROP TABLE "stat_periods";--> statement-breakpoint
DROP TYPE "public"."stat_source";--> statement-breakpoint
DROP TABLE "region_status";--> statement-breakpoint
DROP TABLE "tracked_summoners";--> statement-breakpoint
WITH stored AS (SELECT DISTINCT jsonb_array_elements_text(jsonb_path_query_array("participants", '$[*].puuid')) AS puuid FROM "match_details")
DELETE FROM "last_known_ranks" l WHERE NOT EXISTS (SELECT 1 FROM stored s WHERE s.puuid = l.puuid);
