-- Estimated database egress per query shape and UTC day (server/db/egress.ts): every server
-- instance adds its counts every few minutes; rows older than 35 days are deleted as new ones
-- arrive. Holds query shapes (SQL text with literals replaced) and counts, never table values.
-- Row Level Security on: the app, as the table's owner, is exempt; any other role sees no rows.
CREATE TABLE "db_egress_daily" (
	"day" date NOT NULL,
	"label" text NOT NULL,
	"sample" text NOT NULL,
	"calls" bigint DEFAULT 0 NOT NULL,
	"rows" bigint DEFAULT 0 NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "db_egress_daily_day_label_pk" PRIMARY KEY("day","label")
);
--> statement-breakpoint
ALTER TABLE "db_egress_daily" ENABLE ROW LEVEL SECURITY;
