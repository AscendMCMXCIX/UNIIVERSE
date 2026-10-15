ALTER TABLE "account_matches" ADD COLUMN "team_id" integer;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "gold" integer;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "wards_placed" integer;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "team_kills" integer;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "team_damage" bigint;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "extra_stats" jsonb;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "summarised_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "account_matches_unsummarised_idx" ON "account_matches" USING btree ("account_id") WHERE "account_matches"."summarised_at" IS NULL AND "account_matches"."champion_id" IS NOT NULL;