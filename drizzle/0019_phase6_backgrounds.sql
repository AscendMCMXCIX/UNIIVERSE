-- Separate sign-in and app backgrounds (Phase 6). The existing "background" image stays the
-- sign-in background; a copy becomes the app background, so the site looks exactly as before
-- until an admin changes either one. Nothing is deleted; no copy is made when there is no
-- background or an app background already exists.
INSERT INTO brand_assets (kind, content_type, data, width, height, animated, updated_at)
SELECT 'appBackground', content_type, data, width, height, animated, updated_at FROM brand_assets WHERE kind = 'background'
ON CONFLICT (kind) DO NOTHING;
--> statement-breakpoint
INSERT INTO brand_assets (kind, content_type, data, width, height, animated, updated_at)
SELECT 'appBackground-static', content_type, data, width, height, animated, updated_at FROM brand_assets WHERE kind = 'background-static'
  AND NOT EXISTS (SELECT 1 FROM brand_assets WHERE kind = 'appBackground' AND updated_at <> (SELECT updated_at FROM brand_assets WHERE kind = 'background'))
ON CONFLICT (kind) DO NOTHING;
