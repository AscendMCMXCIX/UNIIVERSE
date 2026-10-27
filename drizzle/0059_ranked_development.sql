-- Ranked Development (docs/RANKED_DEVELOPMENT.md): Solo Queue Blocks become sessions, with a
-- weakness library (development_objectives), versioned If–Then plans (development_plans), and a
-- short review on each session game. Additive and data-preserving: two new tables, new nullable or
-- defaulted columns on ranked_blocks and ranked_games, and a backfill that keeps every block, game,
-- note and mistake as it was:
--   - games keep their main mistake and notes; a game with either counts as reviewed, and its
--     mistake is also read into the shared areas (went_wrong) through the same mapping as
--     domain/development/categories LEGACY_MISTAKE_CATEGORY;
--   - a player's ranked focus sentence becomes their primary objective (status Practising), with
--     the champions they chose for it; ranked_profiles itself is left untouched;
--   - a block still in progress follows that objective and counts as active now, so it has the
--     full idle period (twelve hours) before it ends by itself; synced games join it only from now
--     on (collects_from), so games its player chose not to import are never added to it. Finished
--     blocks collect nothing.
-- The new tables get Row Level Security, no Data API grants and the backup role's SELECT
-- (docs/DATABASE_PERMISSIONS.md). Rollback: drop the two tables and the added columns; no
-- earlier value is changed except the new columns' backfill.
CREATE TABLE "development_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"custom_category" text,
	"role" "role",
	"champion_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'identified' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"measure" text,
	"plan_id" uuid,
	"identified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'player' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "development_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"objective_id" uuid,
	"if_text" text NOT NULL,
	"then_text" text NOT NULL,
	"template_key" text,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD COLUMN "objective_id" uuid;--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD COLUMN "collects_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD COLUMN "start_rank" jsonb;--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD COLUMN "closing_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "objective_id" uuid;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "review_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "execution" smallint;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "went_well" text;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "went_wrong" text;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "learning" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "adjustment" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "needs_confirmation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD COLUMN "alternative_block_id" uuid;--> statement-breakpoint
ALTER TABLE "development_objectives" ADD CONSTRAINT "development_objectives_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_objectives" ADD CONSTRAINT "development_objectives_plan_id_development_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."development_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_plans" ADD CONSTRAINT "development_plans_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_plans" ADD CONSTRAINT "development_plans_objective_id_development_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."development_objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "development_objectives_player_idx" ON "development_objectives" USING btree ("player_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "development_objectives_one_primary_idx" ON "development_objectives" USING btree ("player_id") WHERE "development_objectives"."is_primary";--> statement-breakpoint
CREATE INDEX "development_plans_player_idx" ON "development_plans" USING btree ("player_id","objective_id");--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD CONSTRAINT "ranked_blocks_objective_id_development_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."development_objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD CONSTRAINT "ranked_blocks_plan_id_development_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."development_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_blocks" ADD CONSTRAINT "ranked_blocks_account_id_riot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD CONSTRAINT "ranked_games_objective_id_development_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."development_objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_games" ADD CONSTRAINT "ranked_games_alternative_block_id_ranked_blocks_id_fk" FOREIGN KEY ("alternative_block_id") REFERENCES "public"."ranked_blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ranked_games_objective_idx" ON "ranked_games" USING btree ("player_id","objective_id");
--> statement-breakpoint
UPDATE "ranked_games" SET "source" = 'import' WHERE "riot_match_id" IS NOT NULL;--> statement-breakpoint
UPDATE "ranked_games" SET "review_status" = 'done', "reviewed_at" = "updated_at" WHERE "main_mistake" IS NOT NULL OR "notes" <> '';--> statement-breakpoint
UPDATE "ranked_games" SET "went_wrong" = CASE "main_mistake"
  WHEN 'mechanics' THEN 'mechanics'
  WHEN 'trading-laning' THEN 'trading'
  WHEN 'wave-tempo' THEN 'wave-management'
  WHEN 'vision-awareness' THEN 'vision'
  WHEN 'macro-objectives' THEN 'objective-setup'
  WHEN 'positioning-teamfight' THEN 'teamfighting'
  WHEN 'decision-making' THEN 'decision-making'
  WHEN 'mental' THEN 'mental'
  WHEN 'other' THEN 'other'
END WHERE "main_mistake" IS NOT NULL;--> statement-breakpoint
INSERT INTO "development_objectives" ("player_id", "title", "category", "status", "is_primary", "champion_ids", "source", "identified_at", "status_changed_at")
SELECT p."player_id", left(btrim(regexp_replace(p."focus", '\s+', ' ', 'g')), 120), 'other', 'practising', true,
  coalesce((SELECT jsonb_agg(v.c ORDER BY v.o) FROM (VALUES (1, p."champion_1"), (2, p."champion_2"), (3, p."champion_3")) AS v(o, c) WHERE v.c IS NOT NULL AND v.c <> ''), '[]'::jsonb),
  'blocks-focus', p."created_at", now()
FROM "ranked_profiles" p WHERE btrim(p."focus") <> '';--> statement-breakpoint
UPDATE "ranked_blocks" b SET "objective_id" = o."id" FROM "development_objectives" o WHERE o."player_id" = b."player_id" AND o."source" = 'blocks-focus' AND b."status" = 'active';--> statement-breakpoint
UPDATE "ranked_blocks" SET "last_activity_at" = now(), "collects_from" = now() WHERE "status" = 'active';--> statement-breakpoint
ALTER TABLE "development_objectives" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "development_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Closed to Supabase's Data API whatever the project's default privileges, and readable by the
-- backup role where it exists (docs/DATABASE_PERMISSIONS.md).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.development_objectives FROM anon;
    REVOKE ALL ON TABLE public.development_plans FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.development_objectives FROM authenticated;
    REVOKE ALL ON TABLE public.development_plans FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniiverse_backup') THEN
    GRANT SELECT ON TABLE public.development_objectives TO uniiverse_backup;
    GRANT SELECT ON TABLE public.development_plans TO uniiverse_backup;
  END IF;
END $$;
