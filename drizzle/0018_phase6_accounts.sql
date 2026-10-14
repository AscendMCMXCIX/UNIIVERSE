-- Main and Alt accounts (Phase 6): each player has exactly one Main linked account; every
-- other linked account is an Alt. Labels only: no account, PUUID, match or statistic changes,
-- and Alt accounts keep counting in every statistic.
-- For each player: the account already labelled main (preferring the one matching the player's
-- Riot ID, then the oldest) stays main; any further "main" (and the retired "role" label) becomes
-- "alt"; a player with linked accounts but no main gets their oldest account as main.
WITH ranked AS (
  SELECT a.id,
         row_number() OVER (
           PARTITION BY a.player_id
           ORDER BY (a.label = 'main') DESC,
                    (lower(a.game_name || '#' || a.tag_line) = lower(coalesce(p.riot_id, ''))) DESC,
                    a.created_at ASC,
                    a.id ASC
         ) AS rn
  FROM riot_accounts a
  JOIN players p ON p.id = a.player_id
  WHERE a.player_id IS NOT NULL AND a.label IN ('main', 'alt', 'role')
)
UPDATE riot_accounts r
SET label = CASE WHEN ranked.rn = 1 THEN 'main' ELSE 'alt' END
FROM ranked
WHERE r.id = ranked.id AND r.label IS DISTINCT FROM (CASE WHEN ranked.rn = 1 THEN 'main' ELSE 'alt' END);
--> statement-breakpoint
CREATE UNIQUE INDEX "riot_accounts_one_main_idx" ON "riot_accounts" USING btree ("player_id") WHERE "riot_accounts"."label" = 'main' AND "riot_accounts"."player_id" IS NOT NULL;
