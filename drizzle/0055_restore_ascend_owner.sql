-- One-time ownership transfer for the team's deployment, the reverse of 0009. 0009 split the
-- owner's account "ascend" in two: "ascend" kept the player profile and became a player, and a new
-- admin-only account "adminascend" became the Owner. The owner wants one account again. Afterwards:
--   * "ascend" is the Owner, with everything it had (profile, Riot accounts, statistics,
--     customisation, history, password and sessions). It opens Player Mode as before; Admin Mode
--     is the switch in its sidebar.
--   * "ascend" is the only administrator: administrator access held by any other account is
--     removed (the Owner can grant it again in Users & Permissions).
--   * What "adminascend" created (Clash Scout scouts, Team Matches bookmarks, series, drafts,
--     activation codes, invitations) is credited to "ascend". The audit log keeps every entry as
--     it was.
--   * "adminascend" can no longer sign in: it is a deactivated player account with no password,
--     no sessions and no activation codes. Deleting it is a later, separate step, once this has
--     been verified in production.
-- Guarded: changes nothing unless "ascend" is an active account with a password and a player
-- profile and "adminascend" is the Owner, so it does nothing on any other deployment and nothing
-- if it ever ran again. "ascend" becomes the Owner before "adminascend" stops being one, and the
-- whole migration is one transaction, so an Owner always exists. Each change is in the audit log.
-- Rollback: make "adminascend" the Owner again with a new password (/recover with the setup key
-- recovers any Owner account) and set "ascend" back to 'player'.
DO $$
DECLARE
  owner_id uuid;
  owner_name text;
  old_id uuid;
  old_name text;
BEGIN
  SELECT id, username INTO owner_id, owner_name FROM "users"
  WHERE lower("username") = 'ascend' AND "is_active" AND "password_hash" IS NOT NULL AND "player_id" IS NOT NULL;
  SELECT id, username INTO old_id, old_name FROM "users"
  WHERE lower("username") = 'adminascend' AND "role" = 'owner';
  IF owner_id IS NULL OR old_id IS NULL THEN
    RETURN;
  END IF;

  -- 1. "ascend" is the Owner (always an administrator, so its own administrator flag is not needed).
  UPDATE "users" SET "role" = 'owner', "is_admin" = false, "updated_at" = now() WHERE "id" = owner_id;

  -- 2. What the admin-only account created is credited to "ascend".
  UPDATE "clash_scouts" SET "created_by" = owner_id WHERE "created_by" = old_id;
  UPDATE "clash_scouts" SET "updated_by" = owner_id WHERE "updated_by" = old_id;
  UPDATE "team_bookmarks" SET "created_by_user_id" = owner_id WHERE "created_by_user_id" = old_id;
  UPDATE "series" SET "created_by_user_id" = owner_id WHERE "created_by_user_id" = old_id;
  UPDATE "drafts" SET "created_by_user_id" = owner_id WHERE "created_by_user_id" = old_id;
  UPDATE "drafts" SET "controller_user_id" = owner_id WHERE "controller_user_id" = old_id;
  UPDATE "activation_codes" SET "created_by_user_id" = owner_id WHERE "created_by_user_id" = old_id;
  UPDATE "invites" SET "created_by_user_id" = owner_id WHERE "created_by_user_id" = old_id;

  -- 3. "ascend" is the only administrator.
  INSERT INTO "audit_events" ("actor_name", "action", "target_type", "target_id", "target_name", "details")
  SELECT 'migration 0055', 'account.admin-revoke', 'user', "id"::text, "username", jsonb_build_object('reason', 'ascend is the only administrator')
  FROM "users" WHERE "is_admin" AND "id" NOT IN (owner_id, old_id);
  UPDATE "users" SET "is_admin" = false, "updated_at" = now() WHERE "is_admin" AND "id" <> owner_id;

  -- 4. "adminascend" can no longer sign in, and nothing it held still works.
  UPDATE "users" SET "role" = 'player', "is_admin" = false, "is_active" = false, "password_hash" = NULL, "must_change_password" = false, "temporary_password_expires_at" = NULL, "updated_at" = now() WHERE "id" = old_id;
  DELETE FROM "sessions" WHERE "user_id" = old_id;
  DELETE FROM "activation_codes" WHERE "user_id" = old_id;

  -- 5. The audit log records the transfer.
  INSERT INTO "audit_events" ("actor_name", "action", "target_type", "target_id", "target_name", "details") VALUES
    ('migration 0055', 'account.role', 'user', owner_id::text, owner_name, jsonb_build_object('role', 'owner', 'reason', 'ownership returned to the owner''s own account')),
    ('migration 0055', 'account.role', 'user', old_id::text, old_name, jsonb_build_object('role', 'player', 'reason', 'replaced by ' || owner_name)),
    ('migration 0055', 'account.deactivate', 'user', old_id::text, old_name, jsonb_build_object('reason', 'password and sessions removed; deleted after verification'));
END $$;
