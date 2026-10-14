CREATE TABLE "champion_skins" (
	"champion_id" text NOT NULL,
	"num" integer NOT NULL,
	"skin_id" text NOT NULL,
	"name" text NOT NULL,
	"first_seen_version" text NOT NULL,
	"last_seen_version" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "champion_skins_champion_id_num_pk" PRIMARY KEY("champion_id","num")
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "featured_skin_num" integer;--> statement-breakpoint
ALTER TABLE "champion_skins" ADD CONSTRAINT "champion_skins_champion_id_champions_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."champions"("id") ON DELETE cascade ON UPDATE no action;