-- Drops the two tables Clash Scout left behind: the scouts the team saved (clash_scouts) and their
-- verified accounts (clash_scout_accounts). Clash Scout was removed on 23 Oct 2026; since then no
-- page, action or job has written them, and only permanent erasure and its reconciliation read them.
-- This change also removes that erasure code, so nothing reads them afterwards.
-- Held until, and only after, all of these:
--   1. the owner has independently verified an encrypted backup that holds these tables
--      (docs/BACKUPS.md: restored and counted) and secured an offline copy;
--   2. Data jobs db-usage, "retired", twice a day apart: no new writes to either table, and no
--      dependent outside the two;
--   3. the owner's explicit go-ahead to drop them.
-- No CASCADE: the accounts table (which references the scouts) goes first, so a dependency nobody
-- expected makes this migration fail instead of being dropped with them. Indexes and foreign keys go
-- with their tables. Recovery: pg_restore --table from that backup, then revert this change.
DROP TABLE "clash_scout_accounts";--> statement-breakpoint
DROP TABLE "clash_scouts";
