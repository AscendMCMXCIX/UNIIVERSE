-- Phase 11: retire the "Other players" group and the Coach role, without deleting anything.
-- Every profile becomes an ordinary team profile (team membership itself is players.team_member);
-- old draft and match snapshots keep their own copy and are not touched.
UPDATE "players" SET "group" = 'main' WHERE "group" = 'other';--> statement-breakpoint
-- The Coach role was already treated as a player (migration 0007); any account still stored with it becomes one.
UPDATE "users" SET "role" = 'player' WHERE "role" = 'coach';--> statement-breakpoint
-- Neither value can come back by accident (a default, an old script, a stale form).
ALTER TABLE "players" ADD CONSTRAINT "players_group_retired_other" CHECK ("group" = 'main');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_retired_coach" CHECK ("role" <> 'coach');
