-- Field performance (src/domain/web-vitals.ts): page loads counted per UTC day, metric, bucket, page
-- group ("players", never an address or id) and device class. Counts only: nothing identifies a
-- person or an account. Written by /api/vitals and kept 35 days. Rollback: DROP TABLE "web_vitals_daily".
CREATE TABLE "web_vitals_daily" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"page" text NOT NULL,
	"device" text NOT NULL,
	"bucket" smallint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "web_vitals_daily_day_metric_page_device_bucket_pk" PRIMARY KEY("day","metric","page","device","bucket")
);
--> statement-breakpoint
ALTER TABLE "web_vitals_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Closed to Supabase's Data API whatever the project's default privileges, and readable by the
-- backup role where it exists (docs/DATABASE_PERMISSIONS.md).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.web_vitals_daily FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.web_vitals_daily FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniiverse_backup') THEN
    GRANT SELECT ON TABLE public.web_vitals_daily TO uniiverse_backup;
  END IF;
END $$;
