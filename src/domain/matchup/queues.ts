import { BUILD_QUEUE_IDS, BUILD_QUEUE_KEYS, DEFAULT_BUILD_QUEUE, type BuildQueueKey } from "@/domain/champion-builds";
import { QUEUE_LABELS as BUILD_QUEUE_LABELS } from "@/domain/champion-builds-words";

/*
  MATCHUP INTEL's queues (docs/MATCHUP_INTEL.md, "In the team's matches"; the owner's decision D5 of
  26 Nov 2026): Ranked Solo/Duo by default, and Ranked Flex, Normal Draft and Clash each on their
  own, never mixed. Swiftplay, Quickplay and Blind Pick are not counted (another economy, no draft).

  The page carries the choice as `queue=solo|flex|draft|clash` (Solo/Duo left out), one choice for
  the whole page: the same parameter, keys, ids and names as Champion Intel's builds by queue
  (src/domain/champion-builds.ts, BUILD_QUEUE_IDS; docs/CHAMPION_INTEL.md, "Address"), taken from
  there so the band and the builds can never read the queue differently.
*/

/** Riot's queue ids, by the key the address uses (the builds' own). */
export const LANE_QUEUE_IDS = BUILD_QUEUE_IDS;
export type LaneQueueKey = BuildQueueKey;
/** The keys in the order the page offers them. */
export const LANE_QUEUE_KEYS: readonly LaneQueueKey[] = BUILD_QUEUE_KEYS;
export const DEFAULT_LANE_QUEUE: LaneQueueKey = DEFAULT_BUILD_QUEUE;

/** Each queue's name, as Match History names it (the builds' own). */
export const QUEUE_LABELS: Record<LaneQueueKey, string> = BUILD_QUEUE_LABELS;

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
