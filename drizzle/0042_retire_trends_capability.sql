-- Meta & Trends was removed: the "view-trends" capability no longer exists. Take it out of stored
-- lists (it is already ignored on read), and reword the two built-in access levels that still
-- describe trends (and drafts), only where the text is still the seeded one, so an Owner's own
-- wording is kept. Text and capability lists only; no row is deleted.
UPDATE "permission_presets" SET "capabilities" = (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM jsonb_array_elements_text("capabilities") AS c WHERE c <> 'view-trends') WHERE "capabilities" @> '["view-trends"]'::jsonb;--> statement-breakpoint
UPDATE "users" SET "custom_capabilities" = (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM jsonb_array_elements_text("custom_capabilities") AS c WHERE c <> 'view-trends') WHERE "custom_capabilities" @> '["view-trends"]'::jsonb;--> statement-breakpoint
UPDATE "permission_presets" SET "description" = 'Default access: view the team, players, statistics and matches; manage their own profile and Riot accounts.' WHERE "level_key" = 'standard' AND "description" = 'Default access: view the team, players, statistics, trends and matches; create drafts; manage their own profile and Riot accounts.';--> statement-breakpoint
UPDATE "permission_presets" SET "description" = 'View the team, players and matches and manage their own profile; no teammate statistics.' WHERE "level_key" = 'restricted' AND "description" = 'View the team, players and matches and manage their own profile; no drafts, trends or teammate statistics.';
