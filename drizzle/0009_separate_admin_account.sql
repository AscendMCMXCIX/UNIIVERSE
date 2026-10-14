-- One-time account split for the team's deployment: the owner account "ascend" carried both the
-- administration and the owner's player profile. Afterwards:
--   * "adminascend" is a new admin-only account (owner role, no player profile, no Riot accounts,
--     no pools, no drafts) that signs in with the same password "ascend" had;
--   * "ascend" keeps everything it had (profile, Riot accounts, pools, drafts, journal, sessions)
--     and becomes a normal player account.
-- Guarded: does nothing on a deployment without such an "ascend" owner, or when "adminascend"
-- already exists; the admin is created before "ascend" is demoted, so an admin always remains.
INSERT INTO "users" ("username", "display_name", "password_hash", "role", "player_id", "is_active", "must_change_password", "setup_completed_at")
SELECT 'adminascend', 'adminascend', u."password_hash", 'owner', NULL, true, false, now()
FROM "users" u
WHERE lower(u."username") = 'ascend' AND u."role" = 'owner' AND u."is_active" AND u."player_id" IS NOT NULL AND u."password_hash" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" a WHERE lower(a."username") = 'adminascend');--> statement-breakpoint
UPDATE "users" SET "role" = 'player', "must_change_password" = false, "setup_completed_at" = coalesce("setup_completed_at", now()), "updated_at" = now()
WHERE lower("username") = 'ascend' AND "role" = 'owner' AND "player_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "users" a WHERE lower(a."username") = 'adminascend' AND a."role" = 'owner' AND a."is_active" AND a."player_id" IS NULL AND a."password_hash" IS NOT NULL);
