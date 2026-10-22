import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Completed personal-data erasures (server/privacy/erasure.ts): the least that keeps an erasure in
 * force. No name, Riot ID, PUUID or account id is stored, only keyed one-way tokens of them
 * (HMAC-SHA256 under a key derived from UNIIVERSE_AUTH_SECRET, which never enters the database),
 * so a row says nothing about anyone without the deployment's secret. The tokens let the app leave
 * the person out of games synced later, refuse to link their Riot accounts again by accident, and
 * re-apply the erasure to a backup restored from before it (docs/BACKUPS.md). `keyCheck` tells
 * whether a row was made with this deployment's key. Row Level Security is on with no policies;
 * the backup role reads it, so every backup carries the erasures made before it.
 */
export const privacyErasures = pgTable(
  "privacy_erasures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Short reference shown to the administrator and named in the audit log (e.g. "ER-7K2QF9"). */
    reference: text("reference").notNull(),
    erasedAt: timestamp("erased_at", { withTimezone: true }).notNull().defaultNow(),
    /** "kind:token" strings (kind = user, player, account, puuid or riotid). */
    tokens: jsonb("tokens").$type<string[]>().notNull(),
    keyCheck: text("key_check").notNull(),
    /**
     * Set when an administrator released the person's Riot accounts because they asked to come
     * back: their games are no longer left out and their accounts may be linked again. A restored
     * backup still loses the account, profile and Riot accounts the erasure removed.
     */
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("privacy_erasures_reference_idx").on(t.reference)],
);
