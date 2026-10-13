import type { PickerChampion } from "@/components/champion-picker";

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
}
