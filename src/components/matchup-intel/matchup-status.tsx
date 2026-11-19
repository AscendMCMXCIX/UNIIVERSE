import { History, Layers, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ChampionIntelView, MatchupPageView } from "@/domain/matchup-intel/types";
import { comparePatches } from "@/domain/patch";
import { Badge } from "@/components/ui/badge";
import { dataSourceOf, publicPatchOf } from "./ability-list";
import { briefingShows } from "./briefing";
import { ASSEMBLED_TITLE, freshnessWords, notRecheckedWords } from "./wording";

/*
  The patch and how fresh the page is, in the picker bar (docs/MATCHUP_INTEL.md, "The dashboard"):
  the game's current patch (or that it is not known, on the offline copy), where the abilities come
  from, which layer the pair shows (a curated briefing and when it was checked, or the assembled
  reference), and the warnings: not re-checked for a later patch, Riot's data changed since the
  check, the ability data older than the game's patch. Short words; each is said in full where it
  applies on the page below.
*/

/** The champions whose ability data is older than the game's current patch. */
export function behindOf(view: MatchupPageView): Array<{ name: string; patch: string }> {
  const current = view.patch.current;
  if (!current) return [];
  const mirror = !!view.you && !!view.enemy && view.you.id === view.enemy.id;
  const shown = [view.enemyIntel, mirror ? null : view.yourIntel].filter((i): i is ChampionIntelView => !!i?.abilities);
  return shown.flatMap((i) => {
    const patch = publicPatchOf(i.dataVersion);
    return patch && comparePatches(patch, current) < 0 ? [{ name: i.champion.name, patch }] : [];
  });
}

/**
 * The dot between two parts of the line, at the end of the part before it: no break falls between a
 * part's last word and its dot, so a wrapped line ends with a dot and never starts with one, and a
 * dot never stands alone on a line (a phone at a large text size).
 */
function Dot() {
  return (
    <span aria-hidden className="ml-2">
      ·
    </span>
  );
}

export function MatchupStatus({ view }: { view: MatchupPageView }) {
  const { you, enemy, matchup, enemyIntel, yourIntel, patch } = view;
  const intel = enemyIntel ?? yourIntel;
  const source = intel ? dataSourceOf(intel) : null;
  const behind = behindOf(view);
  const shows = briefingShows(matchup);
  const f = matchup ? freshnessWords(matchup.freshness, matchup.verified.patch) : null;
  const recheck = matchup?.recheck ?? null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted @min-[44rem]/pickers:justify-end" data-testid="matchup-patch-state">
      <span>
        <span className="font-medium text-fg" data-testid="matchup-patch">
          {patch.current ? `Patch ${patch.current}` : "Game patch not known"}
        </span>
        {source || (you && enemy) ? <Dot /> : null}
      </span>
      {source ? (
        <span>
          {source}
          {you && enemy ? <Dot /> : null}
        </span>
      ) : null}
      {you && enemy ? (
        <>
          {matchup && shows && f ? (
            <span className="inline-flex items-center gap-1" data-testid="matchup-layer" data-layer="curated">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-good" aria-hidden />
              {/* The dot held to the words before it (a no-break space), so a wrapped line never starts with it. */}
              {`Curated briefing\u00a0· ${f.checked.charAt(0).toLowerCase()}${f.checked.slice(1)}`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1" data-testid="matchup-layer" data-layer="assembled">
              <Layers className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
              {ASSEMBLED_TITLE}
            </span>
          )}
          {matchup && shows && recheck && !recheck.expired ? (
            <Badge tone="neutral">
              <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {notRecheckedWords(recheck.patch)}
            </Badge>
          ) : null}
          {matchup && shows && f?.warning ? (
            <Badge tone="warn">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Changed since the check
            </Badge>
          ) : null}
        </>
      ) : null}
      {behind.length ? (
        <Badge tone="warn">
          <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Ability data from patch {behind[0]!.patch}
        </Badge>
      ) : null}
    </p>
  );
}
