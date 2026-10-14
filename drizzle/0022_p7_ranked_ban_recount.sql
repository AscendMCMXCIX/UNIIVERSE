-- Ranked ban counts are "games in which the champion was banned". Earlier aggregation counted a
-- champion banned by both teams in the same game twice. Recount the derived ranked ban table from
-- the stored matches (raw match and ban rows are kept and not modified). Aggregation batches wait
-- on the lock and add their own, not yet aggregated, matches afterwards.
LOCK TABLE "champion_ban_stats" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
DELETE FROM "champion_ban_stats" WHERE "source" = 'ranked';--> statement-breakpoint
INSERT INTO "champion_ban_stats" ("patch", "source", "tier_band", "champion_id", "bans", "updated_at")
SELECT m."patch", 'ranked',
       CASE WHEN upper(coalesce(m."tier_band", '')) IN ('CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD') THEN upper(m."tier_band") ELSE 'MASTER+' END,
       c."id", count(DISTINCT b."match_id")::int, now()
FROM "ranked_bans" b
JOIN "ranked_matches" m ON m."match_id" = b."match_id"
JOIN "champions" c ON c."key" = b."champion_key"
WHERE m."aggregated_at" IS NOT NULL
GROUP BY 1, 3, 4;--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value", "updated_at") VALUES ('stats_version', to_jsonb(now()::text), now())
ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value", "updated_at" = now();
