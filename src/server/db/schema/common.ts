import { customType, pgEnum, timestamp } from "drizzle-orm/pg-core";
import { ROLES } from "@/domain/roles";

export const roleEnum = pgEnum("role", ROLES);
export const sideEnum = pgEnum("side", ["blue", "red"]);
export const playerGroupEnum = pgEnum("player_group", ["main", "other"]);
export const poolSlotEnum = pgEnum("pool_slot", ["primary", "secondary"]);
export const statSourceEnum = pgEnum("stat_source", ["ranked", "pro", "demo"]);
export const refreshStatusEnum = pgEnum("refresh_status", ["never", "ok", "degraded", "failed", "running"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "coach", "player"]);
export const accountOwnerEnum = pgEnum("account_owner", ["player", "opponent"]);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Binary column (images stored in Postgres: profile pictures, branding). */
export const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value) {
    return Buffer.isBuffer(value) ? value : Buffer.from(value);
  },
});
