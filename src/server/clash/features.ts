import { clashScoutEnabled } from "./access";
import { fakeClashSettings } from "./fake-clash";

/*
  Clash Scout's switches for what needs Riot's review before it may be released. Each is off
  unless UNIIVERSE_CLASH_FEATURES names it (comma or space separated), so a deployment makes none
  of these calls until the owner turns one on after Riot's written approval:

    registration  our own team's Clash registration: the tournament days, the registered team and
                  its roster (CLASH-V1 tournaments and teams/{id}, and players/by-puuid with the
                  members' own linked accounts);
    rosters       an opponent's registered roster, checked against the scouting screenshots
                  (CLASH-V1 players/by-puuid and teams/{id} for an account the team already knows
                  or a member entered, then ACCOUNT-V1 by-puuid for the current Riot IDs);
    capture       reading the scouting screens from a window the member chooses to share
                  (getDisplayMedia), in the browser, instead of pasting screenshots.

  The server decides on every page and action; the browser only learns the outcome. With
  UNIIVERSE_CLASH_SCOUT=off, Clash Scout and all of these are off.
*/

export const CLASH_FEATURES = ["registration", "rosters", "capture"] as const;
export type ClashFeature = (typeof CLASH_FEATURES)[number];

export function parseClashFeatures(spec: string | undefined): Set<ClashFeature> {
  const wanted = new Set((spec ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean));
  return new Set(CLASH_FEATURES.filter((f) => wanted.has(f)));
}

/** The switches in force for this request (the browser tests' stand-in may set its own). */
export async function clashFeatures(): Promise<ReadonlySet<ClashFeature>> {
  if (!clashScoutEnabled()) return new Set();
  const fake = await fakeClashSettings();
  return fake ? fake.features : parseClashFeatures(process.env.UNIIVERSE_CLASH_FEATURES);
}
