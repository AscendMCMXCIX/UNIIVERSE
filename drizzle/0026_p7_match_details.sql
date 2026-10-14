CREATE TABLE "match_details" (
	"match_id" text PRIMARY KEY NOT NULL,
	"platform" text,
	"queue_id" integer,
	"game_creation" bigint NOT NULL,
	"game_duration" integer NOT NULL,
	"game_version" text,
	"teams" jsonb NOT NULL,
	"participants" jsonb NOT NULL,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL
);
