-- White-label (Phase 4): the app's names are settings, and a new install starts with neutral ones
-- ("Team Hub", domain/branding.ts). An install that already has accounts keeps the names it showed
-- until now: "UNIIVERSE", unless its Owner had already saved their own team and short name.
-- Only the "branding" row of app_settings is written: added when missing, and only keys it lacks
-- are filled (existing values win). Nothing is deleted. A new, empty install is left untouched.
INSERT INTO "app_settings" ("key", "value", "updated_at")
SELECT 'branding', '{"productName":"UNIIVERSE","teamName":"UNIIVERSE","shortName":"UNIIVERSE"}'::jsonb, now()
WHERE EXISTS (SELECT 1 FROM "users") AND NOT EXISTS (SELECT 1 FROM "app_settings" WHERE "key" = 'branding');
--> statement-breakpoint
UPDATE "app_settings"
SET "value" = '{"productName":"UNIIVERSE","teamName":"UNIIVERSE","shortName":"UNIIVERSE"}'::jsonb || "value", "updated_at" = now()
WHERE "key" = 'branding' AND jsonb_typeof("value") = 'object' AND ("value" -> 'productName') IS NULL;
