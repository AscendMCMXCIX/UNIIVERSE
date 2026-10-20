import { createHmac, timingSafeEqual } from "node:crypto";
import { sessionSecretValue } from "@/server/auth/mode";
import type { ScoutContent } from "@/domain/clash-scout/types";

/*
  A verified Riot account in a scout is only ever one this server checked with Riot. When it
  verifies a Riot ID it signs (team, platform, Riot ID, PUUID) with the session secret; saving a
  scout keeps "verified" only for players whose signature checks out (or who were already verified
  in the stored scout), and turns anything else back into a plain, unverified name.
*/

function sign(teamId: string, platform: string, riotId: string, puuid: string): string {
  return createHmac("sha256", sessionSecretValue()).update(`clash-verify\n${teamId}\n${platform}\n${riotId}\n${puuid}`).digest("base64url");
}

export function verificationProof(teamId: string, platform: string, riotId: string, puuid: string): string {
  return sign(teamId, platform.toLowerCase(), riotId, puuid);
}

function valid(teamId: string, platform: string, riotId: string, puuid: string, proof: string): boolean {
  const want = Buffer.from(sign(teamId, platform.toLowerCase(), riotId, puuid));
  const got = Buffer.from(proof);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The content with every unproven verification removed and proofs dropped (they are never stored). */
export function keepProvenVerifications(teamId: string, content: ScoutContent, alreadyVerified: ReadonlyArray<{ riotId: string; puuid: string }> = []): ScoutContent {
  return {
    ...content,
    players: content.players.map((p) => {
      const { proof, ...rest } = p;
      const known = !!p.riotId && !!p.puuid && alreadyVerified.some((v) => v.riotId === p.riotId && v.puuid === p.puuid);
      const proven = known || (!!p.riotId && !!p.puuid && !!proof && valid(teamId, content.platform, p.riotId, p.puuid, proof));
      return p.verification === "verified" && proven ? { ...rest, verification: "verified" as const } : { ...rest, verification: "unverified" as const, riotId: null, puuid: null };
    }),
  };
}
