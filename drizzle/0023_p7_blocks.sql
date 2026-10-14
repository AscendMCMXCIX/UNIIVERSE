ALTER TABLE "ranked_blocks" ADD COLUMN "planned_games" integer;--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD COLUMN "focus" text;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "not_played_with" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "account_matches_match_idx" ON "account_matches" USING btree ("match_id");--> statement-breakpoint
-- Blocks started before sizes were chosen were six-game blocks. Their focus at the time was not
-- recorded, so it stays empty rather than being guessed.
UPDATE "ranked_blocks" SET "planned_games" = 6 WHERE "planned_games" IS NULL;
