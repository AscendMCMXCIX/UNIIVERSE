/*
  THE SWITCHES FOR THE HIGH-ELO COLLECTION (docs/HIGH_ELO_EVIDENCE.md, "Switching on"; the owner's
  D2 of 26 Nov 2026: develop it, keep collection DISABLED until every Riot registration, privacy, API
  and hosting requirement is satisfied). Two keys, both required, and a hard guard:

  1. In code, HIGH_ELO_LADDER_REGISTERED: false until Riot's registration describes this collection
     and the owner has said so. While false, the Riot client has no apex-ladder request at all
     (server/riot/api/client.ts; src/server/riot/api/endpoints.test.ts refuses one), so no ladder
     can be read whatever else is set. It becomes true only in the enabling pull request, with the
     ladder requests, the privacy notice's row and the registered description.
  2. The deployment's: UNIIVERSE_HIGH_ELO_COLLECTION=on (exactly), set by the owner in Vercel
     (Production). Never on the in-memory demo.
  The job (server/jobs/high-elo-sample.ts) refuses to run without both and a Riot key, and the slice
  (sampler.ts) checks again before it makes any client. Admin → Data & Integrations shows the state;
  /api/health says only "on" or "off".
*/

/** Key 1, in code: the apex-ladder requests are in the Riot client only once Riot's registration describes this collection. */
export const HIGH_ELO_LADDER_REGISTERED = false;

/** Key 2, the deployment's: on only where the server's environment says exactly "on", never on the in-memory demo. */
export function highEloSwitchOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.UNIIVERSE_HIGH_ELO_COLLECTION === "on" && env.UNIIVERSE_DB_MODE !== "memory";
}

export type HighEloOff = "not-registered" | "switch-off" | "no-key";

/** Whether a slice may run, and if not, every reason (words only). */
export function highEloGate(env: NodeJS.ProcessEnv = process.env, registered: boolean = HIGH_ELO_LADDER_REGISTERED): { on: boolean; off: HighEloOff[] } {
  const off: HighEloOff[] = [];
  if (!registered) off.push("not-registered");
  if (!highEloSwitchOn(env)) off.push("switch-off");
  if (!env.RIOT_API_KEY) off.push("no-key");
  return { on: off.length === 0, off };
}

/**
 * Browser tests only: "on" shows the Master+ source over the in-memory demo's synthetic counts
 * (server/demo/high-elo.ts) while collection is off. Read only on the in-memory demo, never on a
 * deployment (the bounds of server/riot/browser-test.ts).
 */
export const HIGH_ELO_TEST_COOKIE = "uniiverse-test-high-elo";

/** Whether Champion Intel offers the Master+ source: collection on (both keys), or a browser test's cookie on the in-memory demo. */
export function highEloShown(testCookie?: string | null, env: NodeJS.ProcessEnv = process.env, registered: boolean = HIGH_ELO_LADDER_REGISTERED): boolean {
  const demo = env.UNIIVERSE_DB_MODE === "memory" && !env.VERCEL;
  if (demo) return testCookie === "on";
  return registered && highEloSwitchOn(env);
}
