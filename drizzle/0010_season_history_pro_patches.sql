ALTER TABLE "riot_accounts" ADD COLUMN "history_backfill" jsonb;--> statement-breakpoint
-- Professional games were stored under Riot's public year-based patch names ("26.20") while
-- every Riot API source uses the client version ("16.20") for the same patch, so pro evidence
-- never lined up with the current patch. Rename to the client version and rebuild the derived
-- pro statistics from the games (the aggregate job does that on its next run). Nothing happens
-- when no year-named pro game exists.
DELETE FROM "champion_role_stats" WHERE "source" = 'pro' AND EXISTS (SELECT 1 FROM "pro_games" WHERE "patch" ~ '^(2[5-9]|[3-9][0-9])\.[0-9]+$');--> statement-breakpoint
DELETE FROM "champion_ban_stats" WHERE "source" = 'pro' AND EXISTS (SELECT 1 FROM "pro_games" WHERE "patch" ~ '^(2[5-9]|[3-9][0-9])\.[0-9]+$');--> statement-breakpoint
DELETE FROM "champion_matchups" WHERE "source" = 'pro' AND EXISTS (SELECT 1 FROM "pro_games" WHERE "patch" ~ '^(2[5-9]|[3-9][0-9])\.[0-9]+$');--> statement-breakpoint
DELETE FROM "champion_synergies" WHERE "source" = 'pro' AND EXISTS (SELECT 1 FROM "pro_games" WHERE "patch" ~ '^(2[5-9]|[3-9][0-9])\.[0-9]+$');--> statement-breakpoint
DELETE FROM "stat_periods" WHERE "source" = 'pro' AND EXISTS (SELECT 1 FROM "pro_games" WHERE "patch" ~ '^(2[5-9]|[3-9][0-9])\.[0-9]+$');--> statement-breakpoint
DELETE FROM "stat_region_periods" WHERE "source" = 'pro' AND EXISTS (SELECT 1 FROM "pro_games" WHERE "patch" ~ '^(2[5-9]|[3-9][0-9])\.[0-9]+$');--> statement-breakpoint
DELETE FROM "stat_rank_periods" WHERE "source" = 'pro' AND EXISTS (SELECT 1 FROM "pro_games" WHERE "patch" ~ '^(2[5-9]|[3-9][0-9])\.[0-9]+$');--> statement-breakpoint
DELETE FROM "pro_pick_slot_stats" WHERE EXISTS (SELECT 1 FROM "pro_games" WHERE "patch" ~ '^(2[5-9]|[3-9][0-9])\.[0-9]+$');--> statement-breakpoint
UPDATE "pro_games" SET "aggregated_at" = NULL WHERE EXISTS (SELECT 1 FROM "pro_games" g WHERE g."patch" ~ '^(2[5-9]|[3-9][0-9])\.[0-9]+$');--> statement-breakpoint
UPDATE "pro_games" SET "patch" = ((split_part("patch", '.', 1))::int - 10)::text || '.' || split_part("patch", '.', 2) WHERE "patch" ~ '^(2[5-9]|[3-9][0-9])\.[0-9]+$';
