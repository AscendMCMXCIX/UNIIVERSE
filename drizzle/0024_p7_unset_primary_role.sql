ALTER TABLE "players" ALTER COLUMN "primary_role" DROP NOT NULL;--> statement-breakpoint
-- Accounts were created with a placeholder primary role ("Mid") that the player never chose.
-- Clear it only where it is certainly that placeholder: the account has not finished setup and
-- the profile holds nothing a person entered (no champions, no other roles) and is in no lineup.
-- Every other player keeps their role exactly as it is.
UPDATE "players" p SET "primary_role" = NULL, "updated_at" = now()
WHERE EXISTS (SELECT 1 FROM "users" u WHERE u."player_id" = p."id" AND u."setup_completed_at" IS NULL)
  AND p."secondary_role" IS NULL
  AND coalesce(jsonb_array_length(p."additional_roles"), 0) = 0
  AND NOT EXISTS (SELECT 1 FROM "player_champion_pools" c WHERE c."player_id" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "player_role_pools" r WHERE r."player_id" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "lineup_slots" s WHERE s."player_id" = p."id");
