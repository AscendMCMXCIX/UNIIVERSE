import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { NoteLevels, NoteSource } from "@/domain/matchup/notes";
import { users } from "./auth";

/**
 * MATCHUP INTEL's reviewed notes (docs/MATCHUP_INTEL.md, "Reviewed notes"; migration 0071): short
 * observations about two champions' kits in one lane that a team administrator writes and reviews
 * in Admin → Platform Settings → Matchup notes, shown in Champion Intel's Compare with that lane.
 *
 * - `scope` "opponent": role + opponent, shown for every pair whose lane opponent it is; "pair":
 *   role + champion played + opponent, for that pairing in that direction.
 * - Each published note records its review: who (the administrator's account; members see "an
 *   administrator"), when, the patch and Data Dragon version, and each scope champion's kit hash
 *   (server/matchup/kit-hash.ts), so its freshness is computed from Riot's data at every read
 *   (domain/matchup/notes noteFreshness): nothing is rewritten when a patch arrives.
 * - The text never names a player (save validation); the three account links are set to NULL by an
 *   erasure (server/privacy/erasure.ts) and by the account's deletion.
 * - History is in Audit Logs (audit_events, action matchup-note.*), never in a table of its own.
 * Static and editorial content only: nothing about any player's games.
 */
export const matchupNotes = pgTable(
  "matchup_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "opponent" | "pair" */
    scope: text("scope").notNull(),
    /** "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" */
    role: text("role").notNull(),
    /** The lane opponent's Data Dragon id. */
    opponentId: text("opponent_id").notNull(),
    /** The champion played (a pair note); NULL for an opponent note. */
    championId: text("champion_id"),
    /** "draft" | "published" | "retired" */
    status: text("status").notNull().default("draft"),
    points: jsonb("points").$type<Array<{ text: string; refs: string[]; levels: NoteLevels }>>().notNull(),
    sources: jsonb("sources").$type<NoteSource[]>().notNull().default(sql`'[]'::jsonb`),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** The patch reviewed on, internal ("16.23"), and its Data Dragon version ("16.23.1"). */
    reviewedPatch: text("reviewed_patch"),
    reviewedVersion: text("reviewed_version"),
    /** Each scope champion's kit hash at the review: { "Darius": "…" }. */
    kitHashes: jsonb("kit_hashes").$type<Record<string, string>>(),
    /** Each scope champion's abilities' hashes at the review, for "what changed" in words: { "Darius": { "E": "…" } }. */
    abilityHashes: jsonb("ability_hashes").$type<Record<string, Record<string, string>>>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("matchup_notes_scope_check", sql`${t.scope} IN ('opponent', 'pair') AND ((${t.scope} = 'pair') = (${t.championId} IS NOT NULL))`),
    check("matchup_notes_role_check", sql`${t.role} IN ('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT')`),
    check("matchup_notes_status_check", sql`${t.status} IN ('draft', 'published', 'retired')`),
    check("matchup_notes_review_check", sql`${t.status} <> 'published' OR (${t.reviewedAt} IS NOT NULL AND ${t.reviewedPatch} IS NOT NULL AND ${t.kitHashes} IS NOT NULL)`),
    // One live note (a draft or a published one) per scope: retiring one frees its place.
    uniqueIndex("matchup_notes_live_idx").on(t.scope, t.role, t.opponentId, sql`coalesce(${t.championId}, '')`).where(sql`${t.status} <> 'retired'`),
    // The band's read: a role's published notes about one opponent.
    index("matchup_notes_read_idx").on(t.role, t.opponentId).where(sql`${t.status} = 'published'`),
  ],
);
