/**
 * Region selector options. Thin view over the central platform list (src/domain/riot-platforms.ts).
 */
import { RIOT_PLATFORMS } from "./riot-platforms";

export { platformLabel, platformName, DEFAULT_RIOT_PLATFORM } from "./riot-platforms";

/** Riot platform ids with the labels players know them by, in selector order. */
export const PLATFORMS: Array<{ id: string; label: string; name: string }> = RIOT_PLATFORMS.map((p) => ({ id: p.id, label: p.label, name: p.name }));
