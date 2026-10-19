CREATE TABLE "lineup_substitutes" (
	"lineup_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"player_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lineup_substitutes" ADD CONSTRAINT "lineup_substitutes_lineup_id_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_substitutes" ADD CONSTRAINT "lineup_substitutes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lineup_substitute_role_idx" ON "lineup_substitutes" USING btree ("lineup_id","role");