-- Phase 13 (Player Card Studio): additive only. A nullable style column and banner version on
-- players (null = the card exactly as before) and a table for optional banner images.
CREATE TABLE "player_card_banners" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "card_style" jsonb;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "card_banner_version" integer;--> statement-breakpoint
ALTER TABLE "player_card_banners" ADD CONSTRAINT "player_card_banners_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;