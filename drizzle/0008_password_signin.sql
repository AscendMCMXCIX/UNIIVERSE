ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "temporary_password_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "activation_codes" SET "revoked_at" = now() WHERE "used_at" IS NULL AND "revoked_at" IS NULL;
