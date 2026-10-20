-- The public page's words are settings (domain/public-site.ts, Admin → Branding → Public page) and
-- start neutral: "Welcome to <team name>.", no sign-off, no Discord link. The original install, the
-- one that calls itself UNIIVERSE (0045), keeps its own welcome and its community's sign-off.
-- Only a missing "public_site" row is added; one an admin already saved is never touched. No
-- Discord invitation is written here, or anywhere but by an admin.
INSERT INTO "app_settings" ("key", "value", "updated_at")
SELECT 'public_site', '{"heroTitle":"Welcome to the UNIIVERSE.","signOff":"Stay Legendary"}'::jsonb, now()
WHERE EXISTS (SELECT 1 FROM "app_settings" WHERE "key" = 'branding' AND "value" ->> 'productName' = 'UNIIVERSE')
ON CONFLICT ("key") DO NOTHING;
