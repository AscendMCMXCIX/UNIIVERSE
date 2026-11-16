import { Fragment } from "react";
import { ExternalLink } from "lucide-react";
import type { MatchupPageView, Source, Verification } from "@/domain/matchup-intel/types";
import { patchFromVersion, publicPatchName } from "@/domain/patch";
import { formatIsoDay } from "@/lib/format";
import { SourceLink } from "./source-link";

/*
  The page's quiet footer (docs/MATCHUP_INTEL.md, "Compliance"): where the numbers come from (Riot
  Data Dragon, with its version and patch), the curated notes' sources with their licence and the
  day they were checked, that this is a static reference for preparation, and Riot's notice, the
  same words the rest of the app shows.
*/

const CC_BY_SA = "https://creativecommons.org/licenses/by-sa/3.0/";

/** Each set of curated notes on the page, with its sources (one each) and when it was checked. */
function sourceGroups(view: MatchupPageView): Array<{ key: string; label: string; sources: Source[]; verified: Verification }> {
  const groups: Array<{ key: string; label: string; sources: Source[]; verified: Verification }> = [];
  const add = (key: string, label: string, sources: readonly Source[], verified: Verification | undefined) => {
    if (!verified) return;
    const unique = sources.filter((s, i) => s.title && sources.findIndex((x) => x.title === s.title && x.url === s.url) === i);
    if (unique.length) groups.push({ key, label, sources: unique, verified });
  };
  const { you, enemy } = view;
  if (view.matchup && you && enemy) add("matchup", `The ${you.name} vs ${enemy.name} briefing`, view.matchup.sources, view.matchup.verified);
  if (view.enemyIntel?.curated) add("enemy", `${view.enemyIntel.champion.name}'s notes`, view.enemyIntel.sources, view.enemyIntel.curated.verified);
  if (view.yourIntel?.curated && view.yourIntel.champion.id !== view.enemyIntel?.champion.id) add("you", `${view.yourIntel.champion.name}'s notes`, view.yourIntel.sources, view.yourIntel.curated.verified);
  return groups;
}

export function MatchupFooter({ view, legal }: { view: MatchupPageView; legal: string }) {
  const version = view.enemyIntel?.dataVersion ?? view.yourIntel?.dataVersion ?? null;
  const patch = version ? patchFromVersion(version) : null;
  const groups = sourceGroups(view);
  const wiki = groups.some((g) => g.sources.some((s) => s.licence === "CC BY-SA 3.0"));
  return (
    <footer className="space-y-1.5 border-t border-border pt-4 text-xs leading-relaxed text-fg-subtle" data-testid="matchup-footer">
      <p data-testid="matchup-footer-ddragon">
        {version ? `Ability names, icons and base cooldowns: Riot Data Dragon ${version}${patch ? ` (patch ${publicPatchName(patch)})` : ""}.` : "Ability names, icons and base cooldowns come from Riot Data Dragon, read once per game version."}
      </p>
      {groups.map((g) => (
        <p key={g.key} data-testid="matchup-footer-sources">
          {g.label}:{" "}
          {g.sources.map((s, i) => (
            <Fragment key={`${s.title}-${s.url}`}>
              {i ? ", " : ""}
              <SourceLink source={s} />
              {s.licence === "CC BY-SA 3.0" ? " (League of Legends Wiki, CC BY-SA 3.0)" : " (Riot Games)"}
            </Fragment>
          ))}
          ; checked on {formatIsoDay(g.verified.checkedOn)} against patch {g.verified.patch}.
        </p>
      ))}
      {wiki ? (
        <p>
          The curated notes are written in our own words from the pages above. League of Legends Wiki pages are under{" "}
          <a href={CC_BY_SA} target="_blank" rel="noopener noreferrer" className="touch-target inline-flex items-baseline gap-1 underline underline-offset-2 hover:text-fg" data-testid="matchup-licence-link">
            CC BY-SA 3.0
            <ExternalLink className="h-3 w-3 shrink-0 self-center" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          ; this page only links to them, and loads nothing from them.
        </p>
      ) : null}
      <p data-testid="matchup-footer-static">A static reference for preparation: no live tracking, no timers, nothing read from a game in progress.</p>
      <p>{legal}</p>
    </footer>
  );
}
