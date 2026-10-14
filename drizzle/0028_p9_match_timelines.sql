CREATE TABLE "match_timelines" (
	"match_id" text PRIMARY KEY NOT NULL,
	"platform" text,
	"participants" jsonb NOT NULL,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL
);
