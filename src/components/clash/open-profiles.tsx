"use client";

import * as React from "react";
import { ExternalLink, Search, ShieldCheck, X } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { verifiedProfileUrl } from "@/domain/clash-scout/links";
import type { ScoutPlayer } from "@/domain/clash-scout/types";
import { opggRegion } from "@/domain/opgg";
import { copyText } from "@/lib/copy-text";

/*
  "Open all verified profiles": each verified player's own OP.GG profile in a tab of its own (the
  shared OP.GG link builder, on the scout's server), never a multi-search page. Nothing opens by
  itself: only this button opens tabs.

  Before the click, the players who are not identified are named beside it: a profile is only ever
  opened for a Riot ID Riot confirmed, never made from a name or an unconfirmed tag. After the click,
  what could not be opened is listed in place:
  - profiles the browser kept from opening (browsers often allow one new tab per click, unless
    pop-ups are allowed for this site): each a plain link, one tap each;
  - players not identified: their name copied for OP.GG's own search (OP.GG publishes no link that
    searches by name), or their Riot ID entered and checked in their card.
*/

const OPGG_HOME = "https://op.gg/";

interface Target {
  slot: number;
  name: string;
  url: string;
}

export function OpenProfiles({ players, platform, onIdentify }: { players: readonly ScoutPlayer[]; platform: string; onIdentify: (slot: number) => void }) {
  const ready: Target[] = players.flatMap((p) => {
    const url = verifiedProfileUrl(p, platform);
    return url ? [{ slot: p.slot, name: p.name, url }] : [];
  });
  const unresolved = players.filter((p) => p.name.trim() && !verifiedProfileUrl(p, platform));
  const [left, setLeft] = React.useState<{ blocked: Target[]; unresolved: number[] } | null>(null);
  const region = opggRegion(platform)?.toUpperCase() ?? platform.toUpperCase();

  const open = () => {
    const blocked: Target[] = [];
    for (const t of ready) {
      // A handle is needed to know whether the browser opened it; the new tab is cut off from this page at once.
      const w = window.open(t.url, "_blank");
      if (w) {
        try {
          w.opener = null;
        } catch {
          // Already cut off (cross-origin isolation): nothing to do.
        }
      } else blocked.push(t);
    }
    const still = unresolved.map((p) => p.slot);
    setLeft(blocked.length || still.length ? { blocked, unresolved: still } : null);
    if (blocked.length) toast.info(`The browser opened ${ready.length - blocked.length} of ${ready.length}: open the others below, or allow pop-ups for this site.`, { duration: 5000 });
  };

  const searchName = async (name: string) => {
    window.open(OPGG_HOME, "_blank", "noopener,noreferrer");
    if (await copyText(name)) toast.info(`“${name}” copied: choose ${region} and paste it into OP.GG's search.`, { duration: 5000 });
  };

  const none = !ready.length && !unresolved.length;
  return (
    <div className="space-y-2" data-testid="clash-open-profiles">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="secondary" onClick={open} disabled={none} title={ready.length ? `Opens each verified player's OP.GG profile on ${region}, one tab each` : "No player is verified yet: confirm an account in a card first"} data-testid="clash-open-all">
          <ExternalLink className="h-4 w-4" aria-hidden /> Open all verified profiles
        </Button>
        {!none ? (
          <p className="text-xs text-fg-muted" data-testid="clash-open-status">
            <span className="tabular-nums text-fg">{ready.length}</span> of 5 identified
            {unresolved.length ? <span className="text-warn"> · not identified: {unresolved.map((p) => p.name).join(", ")}</span> : null}
          </p>
        ) : null}
      </div>

      {left ? (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm" role="status" data-testid="clash-open-left">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              {left.blocked.length ? (
                <div className="space-y-1">
                  <p className="text-xs text-fg-muted">The browser kept {left.blocked.length === 1 ? "this profile" : "these profiles"} from opening (allow pop-ups for this site to open all at once):</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {left.blocked.map((t) => (
                      <li key={t.slot}>
                        <a href={t.url} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")} data-testid="clash-open-blocked" lang="">
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {t.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {left.unresolved.length ? (
                <div className="space-y-1">
                  <p className="text-xs text-fg-muted">Not identified, so no profile was opened:</p>
                  <ul className="space-y-1">
                    {left.unresolved.map((slot) => {
                      const p = players.find((x) => x.slot === slot);
                      if (!p) return null;
                      return (
                        <li key={slot} className="flex flex-wrap items-center gap-1.5" data-testid="clash-open-unresolved">
                          <span className="min-w-0 truncate font-medium text-fg" lang="">
                            {p.name}
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => void searchName(p.name)} title={`Copies the name and opens OP.GG: choose ${region} and paste it into the search`} data-testid="clash-open-search">
                            <Search className="h-3.5 w-3.5" aria-hidden /> Search on OP.GG
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onIdentify(slot)} data-testid="clash-open-identify">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Enter Riot ID
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
            <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg max-md:h-11 max-md:w-11" onClick={() => setLeft(null)} aria-label="Close" data-testid="clash-open-close">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
