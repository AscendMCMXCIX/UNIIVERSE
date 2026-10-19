"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Select } from "@/components/ui/input";
import { CardAvatar } from "@/components/players/card-look";
import type { CardLook } from "@/domain/card-style";
import { cn } from "@/lib/cn";

/*
  The filter controls of Team → Matches (both tabs). Every choice is a link the server prepared,
  so each view keeps its own address, Back works and nothing is fetched beyond the page itself;
  these controls only choose which link to follow. A choice shows at once while the page loads.
*/

export interface LinkOption {
  value: string;
  label: string;
  href: string;
}

/** Follows a prepared link without moving the page; shows the choice at once. */
function useGo() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const go = React.useCallback((href: string) => startTransition(() => router.push(href, { scroll: false })), [router]);
  return { go, pending };
}

/** A compact dropdown whose options are links (season, game mode, members in the game…). */
export function LinkSelect({ id, label, value, options, testId, className }: { id: string; label: string; value: string; options: LinkOption[]; testId?: string; className?: string }) {
  const { go, pending } = useGo();
  const [shown, setShown] = React.useState(value);
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    setShown(value);
  }
  return (
    <Select
      id={id}
      aria-label={label}
      value={shown}
      disabled={pending}
      onChange={(e) => {
        const o = options.find((x) => x.value === e.target.value);
        if (!o) return;
        setShown(o.value);
        go(o.href);
      }}
      className={cn("md:w-auto", className)}
      data-testid={testId}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export interface MemberOption {
  id: string;
  name: string;
  avatarUrl: string | null;
  look: CardLook;
  selected: boolean;
  /** Where choosing (or, when selected, removing) this member leads. */
  href: string;
}

/**
 * Team members as one compact button that opens a small searchable list, instead of a chip per
 * member. `multiple`: several members can be chosen (games where all of them played together);
 * otherwise one member or everyone. Arrow keys move, Enter chooses, Escape closes; a click outside
 * closes too. The first entry clears the choice.
 */
export function MemberPicker({ label, emptyLabel, members, clearHref, multiple = false, testId = "member-picker" }: { label: string; emptyLabel: string; members: MemberOption[]; clearHref: string; multiple?: boolean; testId?: string }) {
  const { go, pending } = useGo();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [alignEnd, setAlignEnd] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const chosen = members.filter((m) => m.selected);
  const buttonText = chosen.length === 0 ? emptyLabel : chosen.length <= 2 ? chosen.map((m) => m.name).join(", ") : `${chosen.length} members`;
  const q = query.trim().toLowerCase();
  // While searching, only matching members; otherwise "everyone" first, then every member.
  const found = members.filter((m) => !q || m.name.toLowerCase().includes(q)).map((m) => ({ key: m.id, name: m.name, href: m.href, selected: m.selected, member: m as MemberOption | null }));
  const options = q ? found : [{ key: "", name: emptyLabel, href: clearHref, selected: chosen.length === 0, member: null }, ...found];

  const hide = (focusButton = false) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };
  const choose = (href: string) => {
    // Several members: the list stays open to add or remove more.
    if (!multiple) hide(true);
    go(href);
  };
  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[active];
      if (o) choose(o.href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hide(true);
    } else if (e.key === "Tab") hide();
  };

  return (
    <div ref={wrapRef} className="relative min-w-0" data-testid={testId}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) return hide();
          const r = buttonRef.current?.getBoundingClientRect();
          setAlignEnd(!!r && r.left + 288 > document.documentElement.clientWidth - 8);
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${buttonText}`}
        disabled={pending && !open}
        className={cn("flex h-11 w-full min-w-0 items-center gap-2 rounded-md border bg-bg-elevated px-2.5 text-left text-sm text-fg transition-colors hover:border-border-strong md:w-auto md:max-w-[16rem] md:pointer-fine:h-9", chosen.length ? "border-accent/50" : "border-border")}
        data-testid={`${testId}-button`}
      >
        {chosen.length ? (
          <span className="flex shrink-0 -space-x-1.5">
            {chosen.slice(0, 3).map((m) => (
              <CardAvatar key={m.id} look={m.look} name={m.name} src={m.avatarUrl} size="xs" />
            ))}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          <span className="text-fg-muted">{label}: </span>
          {buttonText}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className={cn("rise-in absolute top-full z-50 mt-1.5 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-panel border border-border bg-bg-elevated shadow-2xl shadow-black/40", alignEnd ? "right-0" : "left-0")} data-testid={`${testId}-panel`}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Find a team member…"
              aria-label={`Find a team member (${members.length})`}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle md:h-10 md:text-sm"
              data-testid={`${testId}-search`}
            />
          </div>
          <ul id={listId} role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} className="max-h-72 overflow-y-auto p-1.5">
            {options.length === 0 ? <li className="px-3 py-4 text-center text-sm text-fg-subtle">No team member matches “{query}”.</li> : null}
            {options.map((o, i) => (
                <li
                  key={o.key || "all"}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.selected}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(o.href)}
                  className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm md:min-h-9", i === active ? "bg-surface-2 text-fg" : "text-fg-muted", o.member === null && "border-b border-border/60")}
                  data-testid={o.member ? `${testId}-option` : `${testId}-clear`}
                  data-player-id={o.member?.id}
                >
                  {o.member ? <CardAvatar look={o.member.look} name={o.member.name} src={o.member.avatarUrl} size="xs" /> : null}
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {o.selected ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden /> : null}
                </li>
            ))}
          </ul>
          {multiple && chosen.length ? (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-fg-muted">
              <span>Games with all {chosen.length === 1 ? "of this member" : `${chosen.length} of them`} on one team</span>
              <button type="button" onClick={() => choose(clearHref)} className="inline-flex min-h-9 items-center gap-1 rounded px-1.5 font-medium text-accent hover:bg-accent/10" data-testid={`${testId}-reset`}>
                <X className="h-3.5 w-3.5" aria-hidden /> Clear
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
