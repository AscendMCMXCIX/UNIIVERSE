"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { PickerChampion } from "@/components/champion-picker";
import { normalise } from "@/components/champions/types";
import { cn } from "@/lib/cn";

const SHOWN = 8;

/**
 * The last cell of a pool: "+ Add champion". Clicking turns the cell itself into a search box with
 * a short list underneath: champions usually played in this role first, any champion by typing.
 * Click or Enter adds one and keeps the box open for the next; Escape, Tab or clicking elsewhere
 * closes it. Champions already in the pool are left out (a pool never holds one twice).
 */
export function AddChampion({ role, champions, exclude, onAdd, testId }: { role: Role; champions: PickerChampion[]; exclude: ReadonlySet<string>; onAdd: (id: string) => void; testId: string }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  const results = React.useMemo(() => {
    const q = normalise(query.trim());
    const free = champions.filter((c) => !exclude.has(c.id));
    if (!q) return free.filter((c) => c.roles?.includes(role)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, SHOWN);
    const starts = free.filter((c) => normalise(c.name).startsWith(q));
    const contains = free.filter((c) => !normalise(c.name).startsWith(q) && normalise(c.name).includes(q));
    return [...starts, ...contains].slice(0, SHOWN);
  }, [query, champions, exclude, role]);

  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const add = (id: string) => {
    onAdd(id);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = results[active];
      if (c) add(c.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab") setOpen(false);
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        className="flex h-full min-h-[3.75rem] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-fg-subtle transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-fg"
        data-testid={`${testId}-toggle`}
      >
        <Plus className="h-4 w-4" aria-hidden /> Add champion
      </button>
    );
  return (
    <div ref={wrapRef} className="relative h-full" data-testid={`${testId}-add`}>
      <label className="flex h-full min-h-[3.75rem] items-center gap-2 rounded-lg border border-accent/60 bg-bg-elevated px-3 ring-2 ring-accent/20">
        <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
        <span className="sr-only">Add a champion to the {ROLE_LABELS[role]} pool</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Champion name…"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="h-10 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle md:text-sm"
          data-testid={`${testId}-search`}
        />
      </label>
      <ul id={listId} role="listbox" aria-label={`Champions to add to ${ROLE_LABELS[role]}`} className="rise-in absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 min-w-[14rem] overflow-y-auto rounded-xl border border-border bg-bg-elevated p-1.5 shadow-2xl shadow-black/40" data-testid={`${testId}-results`}>
        {!query ? <li role="presentation" className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Often played {ROLE_LABELS[role]}</li> : null}
        {results.length === 0 ? <li className="px-2 py-3 text-center text-sm text-fg-subtle">{query ? `No champion matches “${query}”.` : "Type a champion's name."}</li> : null}
        {results.map((c, i) => (
          <li
            key={c.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onPointerMove={() => setActive(i)}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => add(c.id)}
            className={cn("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm md:min-h-9", i === active ? "bg-surface-2 text-fg" : "text-fg-muted")}
            data-champion={c.id}
          >
            {c.portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.portraitUrl} alt="" width={24} height={24} loading="lazy" className="h-6 w-6 shrink-0 rounded object-cover" />
            ) : (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-surface-3 text-[9px] font-semibold">{c.name.slice(0, 2).toUpperCase()}</span>
            )}
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {i === active ? <span className="text-[11px] text-fg-subtle">Enter</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
