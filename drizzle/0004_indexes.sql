CREATE INDEX IF NOT EXISTS "players_team_idx" ON "players" USING btree ("team_id","archived_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_team_created_idx" ON "drafts" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_runs_started_idx" ON "job_runs" USING btree ("started_at");