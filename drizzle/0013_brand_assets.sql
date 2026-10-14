CREATE TABLE "brand_assets" (
	"kind" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"width" integer,
	"height" integer,
	"animated" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- A logo saved before this migration lived inline in the branding settings as a data URL; copy it
-- into the new table (the settings value is left untouched).
INSERT INTO "brand_assets" ("kind", "content_type", "data")
SELECT 'logo',
       substring("value"->>'logoDataUrl' from '^data:(image/[a-z+.-]+);base64,'),
       decode(split_part("value"->>'logoDataUrl', ',', 2), 'base64')
FROM "app_settings"
WHERE "key" = 'branding' AND ("value"->>'logoDataUrl') ~ '^data:image/(png|jpeg|webp|gif|svg\+xml);base64,'
ON CONFLICT ("kind") DO NOTHING;
