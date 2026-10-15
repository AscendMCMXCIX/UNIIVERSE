CREATE TABLE "rank_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"queue" text NOT NULL,
	"tier" text,
	"division" text,
	"league_points" integer,
	"wins" integer,
	"losses" integer,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_account_id_riot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_snapshots_account_queue_idx" ON "rank_snapshots" USING btree ("account_id","queue","captured_at");--> statement-breakpoint
-- Tracking starts from the rank already stored for each account, at the time it was read from Riot (real data, nothing invented).
INSERT INTO "rank_snapshots" ("account_id", "queue", "tier", "division", "league_points", "wins", "losses", "captured_at")
SELECT "id", "rank_queue", "tier", "division", "league_points", "ranked_wins", "ranked_losses", "rank_updated_at"
FROM "riot_accounts"
WHERE "tier" IS NOT NULL AND "rank_queue" IN ('solo', 'flex') AND "rank_updated_at" IS NOT NULL AND "owner_type" = 'player';
