CREATE TABLE "clash_scout_accounts" (
	"scout_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"slot" smallint NOT NULL,
	"puuid" text NOT NULL,
	CONSTRAINT "clash_scout_accounts_scout_id_slot_pk" PRIMARY KEY("scout_id","slot")
);
--> statement-breakpoint
CREATE TABLE "clash_scouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"opponent_name" text NOT NULL,
	"platform" text NOT NULL,
	"tournament_name" text,
	"content" jsonb NOT NULL,
	"players_captured" smallint DEFAULT 0 NOT NULL,
	"players_verified" smallint DEFAULT 0 NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"archived_at" timestamp with time zone,
	"scouted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clash_scout_accounts" ADD CONSTRAINT "clash_scout_accounts_scout_id_clash_scouts_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."clash_scouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clash_scout_accounts" ADD CONSTRAINT "clash_scout_accounts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clash_scouts" ADD CONSTRAINT "clash_scouts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clash_scouts" ADD CONSTRAINT "clash_scouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clash_scouts" ADD CONSTRAINT "clash_scouts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clash_scout_accounts_puuid_idx" ON "clash_scout_accounts" USING btree ("team_id","puuid");--> statement-breakpoint
CREATE INDEX "clash_scouts_team_idx" ON "clash_scouts" USING btree ("team_id","scouted_at");--> statement-breakpoint
ALTER TABLE "clash_scouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clash_scout_accounts" ENABLE ROW LEVEL SECURITY;
