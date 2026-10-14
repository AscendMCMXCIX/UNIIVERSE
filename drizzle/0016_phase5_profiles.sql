CREATE TABLE "player_role_pools" (
	"player_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"champion_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_tags" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inputs_hash" text DEFAULT '' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "additional_roles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "featured_champion_id" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "card_accent" text;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "kills" integer;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "deaths" integer;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "assists" integer;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "cs" integer;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "damage" integer;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "vision_score" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "draft_rules" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_role_pools" ADD CONSTRAINT "player_role_pools_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_role_pools" ADD CONSTRAINT "player_role_pools_champion_id_champions_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."champions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_tags" ADD CONSTRAINT "player_tags_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_pool_player_role_champion_idx" ON "player_role_pools" USING btree ("player_id","role","champion_id");