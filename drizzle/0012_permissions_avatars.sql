CREATE TABLE "permission_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"capabilities" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_avatars" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "permission_preset_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_capabilities" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_version" integer;--> statement-breakpoint
ALTER TABLE "riot_accounts" ADD COLUMN "riot_id_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_presets_name_lower_idx" ON "permission_presets" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_permission_preset_id_permission_presets_id_fk" FOREIGN KEY ("permission_preset_id") REFERENCES "public"."permission_presets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Two starting presets. Standard Player is the default (every existing player keeps exactly the
-- rights they had: view everything, create drafts, manage their own profile and Riot accounts).
INSERT INTO "permission_presets" ("name", "description", "capabilities", "is_default")
VALUES
  ('Standard Player', 'Default access: view the team, players, statistics, trends and matches; create drafts; manage their own profile and Riot accounts.', '["view-team","view-players","view-teammate-stats","view-trends","view-matches","create-draft","edit-own-profile","manage-own-riot-accounts"]'::jsonb, true),
  ('Restricted Player', 'View the team, players and matches and manage their own profile; no drafts, trends or teammate statistics.', '["view-team","view-players","view-matches","edit-own-profile","manage-own-riot-accounts"]'::jsonb, false)
ON CONFLICT DO NOTHING;
