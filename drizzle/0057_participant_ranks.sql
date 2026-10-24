-- Match History's rank checks (src/server/players/participant-ranks.ts): when a member opens a
-- match, the players whose stored rank is missing or over three days old are looked up with
-- LEAGUE-V4 and kept here, one row per player, with both ranked queues ("UNRANKED" when Riot lists
-- no entry) and the LP. The four columns are new and empty; the rows migration 0048 copied keep
-- their Solo/Duo tier as they are. The partial index serves the daily limit on lookups. Additive
-- only: no row or column is changed or removed, and the table keeps its Row Level Security and
-- grants (it is not a new table). Rollback: DROP INDEX "last_known_ranks_lookups_idx", then drop
-- the four columns.
ALTER TABLE "last_known_ranks" ADD COLUMN "league_points" integer;--> statement-breakpoint
ALTER TABLE "last_known_ranks" ADD COLUMN "flex_tier" text;--> statement-breakpoint
ALTER TABLE "last_known_ranks" ADD COLUMN "flex_division" text;--> statement-breakpoint
ALTER TABLE "last_known_ranks" ADD COLUMN "flex_league_points" integer;--> statement-breakpoint
CREATE INDEX "last_known_ranks_lookups_idx" ON "last_known_ranks" USING btree ("observed_at") WHERE "last_known_ranks"."source" = 'match lookup';