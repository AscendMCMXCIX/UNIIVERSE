-- Last-known ranks of players outside the team: Match History shows them beside a match's
-- players, with their date. Copied here from the two retired sources, the Draft's enemy scouting
-- (draft_enemy_scouting) and the Meta & Trends ranked ladder (tracked_summoners), before those
-- tables are dropped: per player, the newest rank either had (on a tie, the scouting row, which
-- has a division). Unranked and undated sightings are not copied: Match History never showed
-- them. The sources are only read. Row Level Security on: the app, as the table's owner, is
-- exempt; any other role sees no rows.
CREATE TABLE "last_known_ranks" (
	"puuid" text PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"division" text,
	"observed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "last_known_ranks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO "last_known_ranks" ("puuid", "tier", "division", "observed_at", "source")
SELECT DISTINCT ON ("puuid") "puuid", "tier", "division", "observed_at", "source"
FROM (
	SELECT "puuid", "tier", "division", "fetched_at" AS "observed_at", 'draft scouting' AS "source"
	FROM "draft_enemy_scouting"
	WHERE "puuid" IS NOT NULL AND "puuid" <> '' AND "tier" IS NOT NULL AND "tier" <> 'UNRANKED' AND "fetched_at" IS NOT NULL
	UNION ALL
	SELECT "puuid", "tier", NULL, "last_seen_in_league_at", 'ranked ladder'
	FROM "tracked_summoners"
	WHERE "puuid" <> '' AND "tier" <> 'UNRANKED'
) AS "seen"
ORDER BY "puuid", "observed_at" DESC, ("source" = 'draft scouting') DESC;
