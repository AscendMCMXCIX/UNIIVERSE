/*
  MATCHUP INTEL's queues (docs/MATCHUP_INTEL.md, "In the team's matches"; the owner's decision D5 of
  26 Nov 2026): Ranked Solo/Duo by default, and Ranked Flex, Normal Draft and Clash each on their
  own, never mixed. Swiftplay, Quickplay and Blind Pick are not counted (another economy, no draft).

  The page carries the choice as `queue=solo|flex|draft|clash` (Solo/Duo left out), one choice for
  the whole page: the same parameter and the same keys as Champion Intel's builds by queue (the
  builds' BUILD_QUEUE_IDS, docs/CHAMPION_INTEL.md, "Address"). Plain constants, so the browser and
  the server read one list.
*/

/** Riot's queue ids, by the key the address uses. */
export const LANE_QUEUE_IDS = { solo: 420, flex: 440, draft: 400, clash: 700 } as const;
export type LaneQueueKey = keyof typeof LANE_QUEUE_IDS;
/** The keys in the order the page offers them. */
export const LANE_QUEUE_KEYS: readonly LaneQueueKey[] = ["solo", "flex", "draft", "clash"];
export const DEFAULT_LANE_QUEUE: LaneQueueKey = "solo";

/** Each queue's name, as Match History names it. */
export const QUEUE_LABELS: Record<LaneQueueKey, string> = { solo: "Ranked Solo/Duo", flex: "Ranked Flex", draft: "Normal Draft", clash: "Clash" };

/** The ids the statement reads (every queue at once; each row carries its own). */
export const LANE_QUEUES: readonly number[] = LANE_QUEUE_KEYS.map((k) => LANE_QUEUE_IDS[k]);

/** The key of a queue id, or null for a queue that is not counted. */
export function queueKeyOf(id: number | null | undefined): LaneQueueKey | null {
  return LANE_QUEUE_KEYS.find((k) => LANE_QUEUE_IDS[k] === id) ?? null;
}

/** Whether a value is one of the queue keys. */
export function isLaneQueueKey(v: unknown): v is LaneQueueKey {
  return typeof v === "string" && (LANE_QUEUE_KEYS as readonly string[]).includes(v);
}
