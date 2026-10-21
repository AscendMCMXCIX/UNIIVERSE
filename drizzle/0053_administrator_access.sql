-- Administrator access as a permission an account holds, not an account of its own: an
-- administrator keeps their player profile, Riot accounts, statistics and customisation, and may
-- also open Admin Mode. Added false for every account: nobody becomes an administrator here. An
-- existing administrator (the Owner, to begin with) grants it in Admin Mode → Users & Permissions, and
-- the Owner is always one whatever this column says. No grant is needed: a column takes its
-- table's privileges (docs/DATABASE_PERMISSIONS.md). Rollback: ALTER TABLE "users" DROP COLUMN "is_admin"
-- (the description below is wording only).
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The built-in Team Manager level still never opens Admin Mode, but Admin Mode is no longer the
-- Owner's alone: its description says "administrators only" now, unless someone has edited it.
UPDATE "permission_presets" SET "description" = 'Everything a player can do, plus running the team from the ordinary pages: the lineup, other players'' profiles and any match. Never Admin Mode, accounts or site settings (administrators only).', "updated_at" = now() WHERE "level_key" = 'administrator' AND "description" = 'Everything a player can do, plus running the team from the ordinary pages: the lineup, other players'' profiles and any match. Never Admin Mode, accounts or site settings (Owner only).';
