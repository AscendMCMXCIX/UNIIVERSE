-- Failed sign-in attempts for throttling (server/auth/throttle.ts), shared by every server
-- instance. Holds only a hash of the throttled key and a time; rows older than 15 minutes are
-- deleted as new failures arrive. Row Level Security on: the app, as the table's owner, is
-- exempt; any other role (such as Supabase's Data API roles) sees no rows.
CREATE TABLE "auth_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_failures_key_at_idx" ON "auth_failures" USING btree ("key_hash","at");--> statement-breakpoint
CREATE INDEX "auth_failures_at_idx" ON "auth_failures" USING btree ("at");--> statement-breakpoint
ALTER TABLE "auth_failures" ENABLE ROW LEVEL SECURITY;
