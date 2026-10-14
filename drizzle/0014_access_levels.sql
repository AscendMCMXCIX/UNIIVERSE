ALTER TABLE "permission_presets" ADD COLUMN "level_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_presets_level_key_idx" ON "permission_presets" USING btree ("level_key") WHERE "permission_presets"."level_key" IS NOT NULL;--> statement-breakpoint
-- Access levels (Phase 4): one selector per account. The two presets from 0012 become the
-- Standard Player and Restricted Player levels, unchanged; an Administrator level is added with
-- every delegable capability (never the owner-only ones: accounts, passwords, permissions).
-- Nobody's access changes: players keep their preset or custom set, owners stay owners.
UPDATE "permission_presets" SET "level_key" = 'standard' WHERE "is_default" AND "level_key" IS NULL;
--> statement-breakpoint
UPDATE "permission_presets" SET "level_key" = 'restricted' WHERE lower("name") = 'restricted player' AND NOT "is_default" AND "level_key" IS NULL;
--> statement-breakpoint
UPDATE "permission_presets" SET "level_key" = 'administrator' WHERE lower("name") = 'administrator' AND NOT "is_default" AND "level_key" IS NULL;
--> statement-breakpoint
INSERT INTO "permission_presets" ("name", "description", "capabilities", "is_default", "level_key")
SELECT 'Administrator', 'Everything a player can do, plus running the team and the site: lineup, players, matches, competition settings, branding and data. Never accounts, passwords or permissions (Owner only).', '["view-team","view-players","view-teammate-stats","view-trends","view-matches","create-draft","edit-own-profile","manage-own-riot-accounts","manage-lineup","manage-players","manage-matches","manage-competition","manage-branding","manage-data"]'::jsonb, false, 'administrator'
WHERE NOT EXISTS (SELECT 1 FROM "permission_presets" WHERE "level_key" = 'administrator')
  AND NOT EXISTS (SELECT 1 FROM "permission_presets" WHERE lower("name") = 'administrator');
--> statement-breakpoint
INSERT INTO "permission_presets" ("name", "description", "capabilities", "is_default", "level_key")
SELECT 'Restricted Player', 'View the team, players and matches and manage their own profile; no drafts, trends or teammate statistics.', '["view-team","view-players","view-matches","edit-own-profile","manage-own-riot-accounts"]'::jsonb, false, 'restricted'
WHERE NOT EXISTS (SELECT 1 FROM "permission_presets" WHERE "level_key" = 'restricted')
  AND NOT EXISTS (SELECT 1 FROM "permission_presets" WHERE lower("name") = 'restricted player');
