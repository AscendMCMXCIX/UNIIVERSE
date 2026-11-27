import type { RiotRegion } from "@/domain/riot-platforms";
import { HIGH_ELO_LADDER_REGISTERED } from "./switch";
import type { SamplerClient } from "./sampler";

/*
  The sampler's Riot client (docs/HIGH_ELO_EVIDENCE.md, "Switching on"). None until key 1
  (HIGH_ELO_LADDER_REGISTERED): the Riot client has no apex-ladder request before the enabling pull
  request, and the sampler needs one. That pull request returns
  createRiotClient({ limitShare: HOST_SHARE[region], deadline }) here, with apexLeague added to the
  client, its schema, endpoints.test.ts and RIOT_COMPLIANCE.md's "Endpoints used".
*/

/** Null: no ladder request exists in this build. */
export function samplerClientFor(_region: RiotRegion, _deadline: number, registered: boolean = HIGH_ELO_LADDER_REGISTERED): SamplerClient | null {
  if (!registered) return null;
  return null;
}
