import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, riotAccounts } from "@/server/db/schema";
import { RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import { AccountError, addAccount, parseRiotId, setMainAccount, type RiotAccountRecord } from "./repository";
import { syncAccount } from "./sync";

export type RiotIdChange =
  /** Same PUUID: the account was renamed; only the stored name changed. */
  | { kind: "renamed"; riotId: string }
  /** A different Riot account: nothing changed yet; the caller must confirm the replacement. */
  | { kind: "different-account"; riotId: string }
  /** The old account was replaced by the new one (after confirmation). */
  | { kind: "replaced"; riotId: string; accountId: string };

/**
 * Case B of a Riot ID change: the player types a different Riot ID for one of their accounts.
 * Riot is asked first; the PUUID decides what happens:
 *   same PUUID            → a rename: the name is updated, every game and statistic stays;
 *   PUUID linked elsewhere → refused (no player can take over another player's account);
 *   a new PUUID            → a different account: only with explicit confirmation does it replace
 *                            the old one (whose games then leave this player's statistics).
 * If Riot cannot be reached nothing changes and the player is told to try again.
 */
export async function changeAccountRiotId(db: Db, client: RiotApiClient, account: RiotAccountRecord, riotIdInput: string, options: { confirmReplace?: boolean } = {}): Promise<RiotIdChange> {
  const parsed = parseRiotId(riotIdInput);
  if (!parsed) throw new AccountError("Enter the Riot ID exactly as shown in the client: GameName#TAG.");
  let acc;
  try {
    acc = await client.accountByRiotId(account.platform, parsed.gameName, parsed.tagLine);
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 404) throw new AccountError(`Riot has no account called ${parsed.gameName}#${parsed.tagLine}. Check the spelling and the #TAG.`);
    throw new AccountError("Riot is not answering right now, so nothing was changed. Try again in a few minutes.");
  }
  const gameName = acc.gameName ?? parsed.gameName;
  const tagLine = acc.tagLine ?? parsed.tagLine;
  const riotId = `${gameName}#${tagLine}`;
  if (account.puuid && acc.puuid === account.puuid) {
    await db.update(riotAccounts).set({ gameName, tagLine, riotIdCheckedAt: new Date(), updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
    if (account.playerId) {
      await db
        .update(players)
        .set({ riotId, updatedAt: new Date() })
        .where(and(eq(players.id, account.playerId), sql`lower(${players.riotId}) = lower(${`${account.gameName}#${account.tagLine}`})`));
    }
    return { kind: "renamed", riotId };
  }
  const [owner] = await db.select({ id: riotAccounts.id, playerId: riotAccounts.playerId }).from(riotAccounts).where(eq(riotAccounts.puuid, acc.puuid));
  if (owner) {
    throw new AccountError(owner.playerId === account.playerId ? `${riotId} is already one of your linked accounts.` : `${riotId} is already linked to another player. Ask an admin if it should move to you.`);
  }
  if (!options.confirmReplace) return { kind: "different-account", riotId };
  // The replacement takes the old account's place, Main included (added as Alt first: only one
  // Main may exist at a time).
  const fresh = await addAccount(db, { ownerType: "player", playerId: account.playerId, riotId, platform: account.platform, puuid: acc.puuid, label: "alt" });
  await db.delete(riotAccounts).where(eq(riotAccounts.id, account.id));
  if (account.label === "main" && account.playerId) await setMainAccount(db, account.playerId, fresh.id);
  // First data straight away; the scheduled sync continues the season history.
  await syncAccount(db, client, fresh, { maxMatchesPerRun: 20 }).catch(() => undefined);
  return { kind: "replaced", riotId, accountId: fresh.id };
}
