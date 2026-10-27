import type { PickerChampion } from "@/components/champion-picker";
import type { Role } from "@/domain/roles";

/** Shapes the journal's client components receive from the page (all serialisable). */
export type JournalChampion = PickerChampion;

export interface TeammateOption {
  id: string;
  displayName: string;
}

export interface AccountOption {
  id: string;
  riotId: string;
}

export interface JournalLookups {
  champions: JournalChampion[];
  championsById: Record<string, JournalChampion>;
  teammates: TeammateOption[];
  /** Names for teammate ids that appear in games (may include archived players). */
  teammateNames: Record<string, string>;
  accounts: AccountOption[];
  /** The player's Primary Role champion pool, in their order of preference (offered first). */
  mainPool: { roleLabel: string | null; ids: string[] };
  /** The player's Primary Role (offered first, never assumed). */
  primaryRole: Role | null;
}
