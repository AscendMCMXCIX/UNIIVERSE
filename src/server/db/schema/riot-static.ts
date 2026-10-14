import { boolean, integer, jsonb, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./common";

/**
 * Riot game versions discovered from Data Dragon. The "patch" is the short form (e.g. 15.19)
 * used to group statistics; `ddragonVersion` is the full asset version (e.g. 15.19.1).
 * Never hard-code the current patch: `isCurrent` is maintained by the version-check job.
 */
export const patches = pgTable("patches", {
  id: text("id").primaryKey(), // e.g. "15.19"
  ddragonVersion: text("ddragon_version").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  /** Ordering key derived from the version number so patches sort correctly (15.9 < 15.10). */
  sortKey: integer("sort_key").notNull(),
});

/**
 * Champion roster synchronised from Data Dragon. The Data Dragon string id (e.g. "MonkeyKing")
 * is the primary key because it is what portraits and pools reference; the numeric `key` is
 * what match data references.
 */
export const champions = pgTable(
  "champions",
  {
    id: text("id").primaryKey(),
    key: integer("key").notNull(),
    name: text("name").notNull(),
    title: text("title").notNull().default(""),
    /** Data Dragon class tags, e.g. ["Fighter","Tank"]. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    attackRange: integer("attack_range").notNull().default(125),
    /** Data Dragon "info" block: attack/defense/magic/difficulty 0-10. */
    info: jsonb("info").$type<{ attack: number; defense: number; magic: number; difficulty: number }>().notNull().default({ attack: 0, defense: 0, magic: 0, difficulty: 0 }),
    partype: text("partype").notNull().default(""),
    imageFull: text("image_full").notNull(),
    firstSeenVersion: text("first_seen_version").notNull(),
    lastSeenVersion: text("last_seen_version").notNull(),
    /** Hash of kit-identifying static data; a large change suggests a rework. */
    fingerprint: text("fingerprint").notNull().default(""),
    /** Whether this record came from a real sync or the offline fixture. */
    source: text("source").notNull().default("ddragon"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("champions_key_idx").on(t.key)],
);

/**
 * Change points let historical evidence be discounted after reworks. `discount` multiplies
 * the weight of evidence from patches before `patch` (0 = ignore completely).
 */
export const championChangePoints = pgTable("champion_change_points", {
  id: serial("id").primaryKey(),
  championId: text("champion_id").notNull().references(() => champions.id, { onDelete: "cascade" }),
  patch: text("patch").notNull(),
  discount: real("discount").notNull().default(0.15),
  reason: text("reason").notNull().default(""),
  source: text("source").notNull().default("manual"), // manual | auto
  confirmed: boolean("confirmed").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Champion skins (splash art) discovered from Data Dragon: the static-sync job reads each
 * champion's detail file on every new game version and adds skins as Riot releases them, so no
 * code change is needed for new champions or skins. `num` is the art index in the splash URL
 * (`{championId}_{num}.jpg`); 0 is the default skin. Skins that leave the data are kept but
 * marked inactive, so a player's saved choice never points at nothing.
 */
export const championSkins = pgTable(
  "champion_skins",
  {
    championId: text("champion_id").notNull().references(() => champions.id, { onDelete: "cascade" }),
    num: integer("num").notNull(),
    /** Riot's skin id (e.g. "92001"). */
    skinId: text("skin_id").notNull(),
    name: text("name").notNull(),
    firstSeenVersion: text("first_seen_version").notNull(),
    lastSeenVersion: text("last_seen_version").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.championId, t.num] })],
);
