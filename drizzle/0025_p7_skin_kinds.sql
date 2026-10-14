ALTER TABLE "champion_skins" ADD COLUMN "kind" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "champion_skins" ADD COLUMN "parent_num" integer;--> statement-breakpoint
ALTER TABLE "champion_skins" ADD COLUMN "splash_status" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "champion_skins" ADD COLUMN "splash_signature" text;--> statement-breakpoint
ALTER TABLE "champion_skins" ADD COLUMN "splash_checked_at" timestamp with time zone;--> statement-breakpoint
-- Data Dragon lists every chroma as its own skin entry ("Base (Variant)"), and chromas have no
-- splash illustration. Until the next champion sync records Riot's own parent marker, classify
-- the stored rows by that pattern: an entry is a chroma when another skin of the same champion
-- carries exactly its base name. Everything else is a skin.
UPDATE "champion_skins" c SET "kind" = 'chroma', "parent_num" = p."num"
FROM "champion_skins" p
WHERE p."champion_id" = c."champion_id" AND p."num" <> c."num"
  AND c."name" ~ '^.+ \([^()]+\)$'
  AND p."name" = regexp_replace(c."name", ' \([^()]+\)$', '');--> statement-breakpoint
UPDATE "champion_skins" SET "kind" = 'skin' WHERE "kind" = 'unknown';--> statement-breakpoint
-- A card that shows a chroma (which has no splash of its own) shows its parent skin instead:
-- the same illustration family. Only the artwork number changes; nothing else about the player.
UPDATE "players" pl SET "featured_skin_num" = c."parent_num"
FROM "champion_skins" c
WHERE c."champion_id" = pl."featured_champion_id" AND c."num" = pl."featured_skin_num"
  AND c."kind" = 'chroma' AND c."parent_num" IS NOT NULL;
