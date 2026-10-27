import type { Db } from "@/server/db/types";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { listChampions } from "@/server/repositories/champions";
import { getPlayer } from "@/server/repositories/team";
import { ROLE_LABELS } from "@/domain/roles";
import { listTeammateOptions, teammateNames } from "./repository";
import type { JournalLookups } from "@/components/ranked/types";

/**
 * Everything the journal's client components need to render names and pickers: champions,
 * the owner's Riot accounts (for the account selector and import attribution) and the team
 * members they may tag. Teammate names cover ids already on games even when archived.
 */
export async function loadJournalLookups(db: Db, teamId: string, ownerPlayerId: string, taggedIds: Array<string | null>): Promise<JournalLookups & { accountState: "none" | "pending" | "synced" }> {
  const [champions, accounts, teammates, names, owner] = await Promise.all([listChampions(db), listAccountsForPlayer(db, ownerPlayerId), listTeammateOptions(db, teamId, ownerPlayerId), teammateNames(db, taggedIds), getPlayer(db, ownerPlayerId)]);
  const list = champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }));
  return {
    champions: list,
    championsById: Object.fromEntries(list.map((c) => [c.id, c])),
    teammates,
    teammateNames: { ...Object.fromEntries(teammates.map((t) => [t.id, t.displayName])), ...names },
    accounts: accounts.map((a) => ({ id: a.id, riotId: a.riotId })),
    // Read fresh on every visit: a changed Primary Role or pool shows at once (saved blocks keep theirs).
    mainPool: { roleLabel: owner?.primaryRole ? ROLE_LABELS[owner.primaryRole] : null, ids: owner?.primaryPool ?? [] },
    primaryRole: owner?.primaryRole ?? null,
    accountState: accounts.length === 0 ? "none" : accounts.some((a) => a.syncStatus === "ok") ? "synced" : "pending",
  };
}
