ALTER TABLE "ranked_blocks" ADD COLUMN "completion_rule" text DEFAULT 'target' NOT NULL;--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD COLUMN "completed_reason" text;