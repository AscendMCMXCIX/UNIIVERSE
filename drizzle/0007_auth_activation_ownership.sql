CREATE TABLE "activation_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "setup_progress" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activation_codes_hash_idx" ON "activation_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "activation_codes_user_idx" ON "activation_codes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_created_by_idx" ON "drafts" USING btree ("created_by_user_id");--> statement-breakpoint
UPDATE "drafts" SET "created_by_user_id" = "controller_user_id" WHERE "created_by_user_id" IS NULL AND "controller_user_id" IS NOT NULL AND "controller_user_id" IN (SELECT "id" FROM "users");--> statement-breakpoint
UPDATE "series" SET "created_by_user_id" = (SELECT d."created_by_user_id" FROM "drafts" d WHERE d."series_id" = "series"."id" AND d."created_by_user_id" IS NOT NULL ORDER BY d."game_number" ASC LIMIT 1) WHERE "created_by_user_id" IS NULL;--> statement-breakpoint
UPDATE "users" SET "role" = 'player' WHERE "role" = 'coach';--> statement-breakpoint
UPDATE "users" SET "draft_lead" = false WHERE "draft_lead" = true;--> statement-breakpoint
UPDATE "invites" SET "expires_at" = now() WHERE "used_at" IS NULL AND "expires_at" > now();
