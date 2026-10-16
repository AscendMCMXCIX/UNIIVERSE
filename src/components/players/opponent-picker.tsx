"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { normalise } from "@/components/champions/types";
import { cn } from "@/lib/cn";

export interface OpponentOption {
  championId: string;
  games: number;
  wins: number;
}

/**
 * "Riven vs Renekton ▾": the lane opponents faced on the champion, most played first, in one
 * searchable list that opens under the button (a combobox: type to narrow, arrow keys to move,
 * Enter to choose, Escape to close the list without closing the window). Each option shows its
 * games and record, so a one-game opponent never looks like a pattern.
 */
export function OpponentPicker({ me, options, current, champ, onChoose, testId = "opponent-picker" }: { me: PortraitChampion; options: OpponentOption[]; current: string | null; champ: (id: string) => PortraitChampion; onChoose: (id: string) => void; testId?: string }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const id = React.useId();
  const wrap = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const q = normalise(query.trim());
  const shown = q ? options.filter((o) => normalise(champ(o.championId).name).includes(q)) : options;
  const cur = options.find((o) => o.championId === current) ?? null;

  React.useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  React.useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const choose = (o: OpponentOption) => {
    setOpen(false);
    setQuery("");
    onChoose(o.championId);
    requestAnimationFrame(() => button.current?.focus());
  };
  return (
    <div ref={wrap} className="relative min-w-0" data-testid={testId}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => {
          // Opens on the current opponent, so the arrow keys start from there.
          if (!open) setActive(Math.max(0, options.findIndex((o) => o.championId === current)));
          setOpen(!open);
        }}
        className="flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-panel border border-border-strong bg-bg-elevated px-2.5 py-1.5 text-left transition-colors hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-accent sm:w-auto sm:min-w-[20rem]"
        data-testid={`${testId}-button`}
      >
        <ChampionPortrait champion={me} size="sm" className="ring-1 ring-accent/50" />
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">vs</span>
        {cur ? <ChampionPortrait champion={champ(cur.championId)} size="sm" /> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg" data-testid={`${testId}-current`}>
            {me.name} vs {cur ? champ(cur.championId).name : "…"}
          </span>
          {cur ? (
            <span className="block text-xs tabular-nums text-fg-subtle">
              {cur.games} game{cur.games === 1 ? "" : "s"} · {cur.wins}W {cur.games - cur.wins}L · {options.length} opponent{options.length === 1 ? "" : "s"} faced
            </span>
          ) : null}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-panel border border-border-strong bg-bg-elevated shadow-xl shadow-black/40 sm:right-auto sm:w-[22rem] motion-safe:fade-in" data-testid={`${testId}-popover`}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
            <input
              ref={input}
              role="combobox"
              aria-expanded
              aria-controls={`${id}-list`}
              aria-activedescendant={shown[active] ? `${id}-${shown[active]!.championId}` : undefined}
              aria-label="Find an opponent"
              placeholder="Find an opponent…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => (shown.length ? (a + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length : 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown[active]) choose(shown[active]!);
                } else if (e.key === "Escape") {
                  // Closes the list only; the window stays open.
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  button.current?.focus();
                } else if (e.key === "Tab") setOpen(false);
              }}
              className="h-11 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              data-testid={`${testId}-search`}
            />
          </div>
          <ul id={`${id}-list`} role="listbox" aria-label={`Lane opponents faced on ${me.name}`} className="max-h-72 overflow-y-auto overscroll-contain py-1">
            {shown.length === 0 ? (
              <li className="px-3 py-3 text-sm text-fg-muted">No opponent matches “{query}”.</li>
            ) : (
              shown.map((o, i) => {
                const on = o.championId === current;
                return (
                  <li
                    key={o.championId}
                    id={`${id}-${o.championId}`}
                    role="option"
                    aria-selected={on}
                    onPointerMove={() => setActive(i)}
                    onClick={() => choose(o)}
                    className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm", i === active ? "bg-surface-2 text-fg" : "text-fg-muted", on && "font-semibold text-fg")}
                    data-testid={`${testId}-option`}
                    data-champion={o.championId}
                  >
                    <ChampionPortrait champion={champ(o.championId)} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{champ(o.championId).name}</span>
                    <span className="shrink-0 text-xs tabular-nums">
                      <span className="text-fg">{o.games}</span> <span className="text-fg-subtle">· {o.wins}W {o.games - o.wins}L</span>
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
