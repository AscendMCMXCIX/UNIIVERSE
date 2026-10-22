-- Records of permanent personal-data erasures (src/server/privacy/erasure.ts): a reference, when,
-- and keyed one-way tokens of the identifiers that were removed (HMAC-SHA256 under a key derived
-- from UNIIVERSE_AUTH_SECRET, which is never stored here). No name, Riot ID, PUUID or account id.
-- They keep an erasure in force: games synced later leave the person out, their Riot accounts are
-- not linked again by accident, and a backup restored from before the erasure is reconciled
-- (docs/BACKUPS.md). Additive only: nothing existing changes. Rollback: DROP TABLE "privacy_erasures".
CREATE TABLE "privacy_erasures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"erased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tokens" jsonb NOT NULL,
	"key_check" text NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_erasures_reference_idx" ON "privacy_erasures" USING btree ("reference");--> statement-breakpoint
ALTER TABLE "privacy_erasures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE public.privacy_erasures FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE public.privacy_erasures FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniiverse_backup') THEN GRANT SELECT ON TABLE public.privacy_erasures TO uniiverse_backup; END IF;
END $$;
