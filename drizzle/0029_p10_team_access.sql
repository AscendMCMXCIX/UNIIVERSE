ALTER TABLE "players" ADD COLUMN "team_member" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Admin Mode is the Owner's alone (Phase 10): the site-setting capabilities and the access groups
-- that opened Admin pages are retired. Remove them from stored lists (reads already ignore them).
UPDATE "permission_presets" SET "capabilities" = (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM jsonb_array_elements_text("capabilities") AS c WHERE c NOT IN ('manage-competition', 'manage-branding', 'manage-data')) WHERE "capabilities" ?| array['manage-competition', 'manage-branding', 'manage-data'];
--> statement-breakpoint
UPDATE "users" SET "custom_capabilities" = (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM jsonb_array_elements_text("custom_capabilities") AS c WHERE c NOT IN ('manage-competition', 'manage-branding', 'manage-data')) WHERE "custom_capabilities" IS NOT NULL AND "custom_capabilities" ?| array['manage-competition', 'manage-branding', 'manage-data'];
--> statement-breakpoint
UPDATE "users" SET "access_groups" = (SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM jsonb_array_elements_text("access_groups") AS g WHERE g NOT IN ('draft-settings-manager', 'branding-manager', 'data-manager')) WHERE "access_groups" ?| array['draft-settings-manager', 'branding-manager', 'data-manager'];
--> statement-breakpoint
-- The built-in "Administrator" level no longer administers anything: it runs the team from the
-- ordinary pages. Renamed so nobody mistakes it for Admin Mode (kept if the name is taken).
UPDATE "permission_presets" SET "name" = 'Team Manager', "description" = 'Everything a player can do, plus running the team from the ordinary pages: the lineup, other players'' profiles and any match. Never Admin Mode, accounts or site settings (Owner only).', "updated_at" = now() WHERE "level_key" = 'administrator' AND lower("name") = 'administrator' AND NOT EXISTS (SELECT 1 FROM "permission_presets" p WHERE lower(p."name") = 'team manager');
