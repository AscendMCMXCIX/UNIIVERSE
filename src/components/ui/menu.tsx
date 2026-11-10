"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { screenBox, screenHeight } from "@/lib/screen";

/*
  A small actions menu (⋯ menus, the account menu, "Change player"…).

  Why a floating layer: menus used to be absolutely positioned inside their card. Cards round
  their corners with overflow-hidden, and lists of cards do the same, so a menu opened on a
  lower card was clipped by its own container and its actions could not be clicked. The menu is
  now rendered in a portal on <body> with fixed coordinates taken from the trigger, so no
  ancestor can clip or stack over it. It opens below the trigger, or above when there is not
  enough room below, and is kept inside the viewport horizontally.

  Behaviour: click or Enter/Space opens and focuses the first item; ↑/↓/Home/End move; Escape or
  Tab closes (Escape returns focus to the trigger); a click outside or a resize closes it, and a
  scroll moves it with its trigger (closing once the trigger is off screen). Choosing an item closes it.
*/

interface MenuContextValue {
  close: (focusTrigger?: boolean) => void;
}

const MenuContext = React.createContext<MenuContextValue | null>(null);

export interface MenuTriggerProps {
  ref: React.RefCallback<HTMLElement>;
  onClick: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
}

export interface MenuProps {
  /** Renders the button that opens the menu; spread the given props onto it. */
  trigger: (props: MenuTriggerProps) => React.ReactNode;
  children: React.ReactNode;
  /** Accessible name of the menu. */
  label: string;
  /** Which trigger edge the menu lines up with. */
  align?: "start" | "end";
  /** Preferred side; flips when there is no room. */
  side?: "bottom" | "top";
  className?: string;
  testId?: string;
}

const GAP = 6;
const MARGIN = 8;

export function Menu({ trigger, children, label, align = "end", side = "bottom", className, testId }: MenuProps) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const id = React.useId();

  const close = React.useCallback((focusTrigger = false) => {
    setOpen(false);
    setPos(null);
    if (focusTrigger) anchor?.focus();
  }, [anchor]);

  const place = React.useCallback(() => {
    const t = anchor;
    const m = menuRef.current;
    if (!t || !m) return;
    const r = t.getBoundingClientRect();
    // The screen as fixed positioning sees it, the box the menu is placed in, rather than
    // window.innerHeight, which iOS has reported wrongly in installed apps (lib/screen.ts).
    const { width: W, height: H } = screenBox();
    const width = m.offsetWidth;
    const height = m.scrollHeight;
    const below = H - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const goUp = side === "top" ? !(above < height && below > above) : below < height && above > below;
    const room = Math.max(120, goUp ? above : below);
    const shown = Math.min(height, room);
    const top = goUp ? r.top - GAP - shown : r.bottom + GAP;
    let left = align === "end" ? r.right - width : r.left;
    left = Math.max(MARGIN, Math.min(left, W - MARGIN - width));
    setPos({ top: Math.max(MARGIN, top), left, maxHeight: room });
  }, [align, side, anchor]);

  React.useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    // Focus the first item once placed (next frame, after the position is applied).
    const raf = requestAnimationFrame(() => items()[0]?.focus());
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || anchor?.contains(target)) return;
      close();
    };
    // A scroll (yours, or the page settling after something else closed) moves the menu with
    // its button; it closes only once the button has left the screen.
    let frame = 0;
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = anchor?.getBoundingClientRect();
        if (!r || r.bottom < 0 || r.top > screenHeight()) close();
        else place();
      });
    };
    const onResize = () => close();
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close, anchor, place]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const list = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close();
    }
  };

  const triggerProps: MenuTriggerProps = {
    ref: setAnchor,
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (open) close();
      else setOpen(true);
    },
    onKeyDown: (e) => {
      if (e.key === "ArrowDown" && !open) {
        e.preventDefault();
        setOpen(true);
      }
    },
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
  };

  return (
    <MenuContext.Provider value={{ close }}>
      {trigger(triggerProps)}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={id}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKeyDown}
              style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden" }}
              className={cn("fade-in z-[60] min-w-48 overflow-y-auto rounded-lg border border-border-strong bg-bg-elevated p-1 shadow-2xl", className)}
              data-testid={testId}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </MenuContext.Provider>
  );
}

const itemClass = (tone: "default" | "danger", active?: boolean) =>
  cn(
    "flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm outline-none transition-colors focus-visible:bg-surface-2 md:min-h-9",
    tone === "danger" ? "text-bad hover:bg-bad/10 focus-visible:bg-bad/10" : "text-fg hover:bg-surface-2",
    active && "bg-accent/10 font-medium text-fg",
  );

export interface MenuItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> {
  onSelect?: () => void;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
  /** Marks the current choice (a checked option). */
  active?: boolean;
  /** Right-hand hint (a role, a count…). */
  hint?: React.ReactNode;
}

/** A menu action. Use type="submit" inside a form for actions that post (sign out). */
export function MenuItem({ onSelect, icon, tone = "default", active, hint, children, className, type = "button", disabled, ...rest }: MenuItemProps) {
  const ctx = React.useContext(MenuContext);
  return (
    <button
      {...rest}
      type={type}
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      className={cn(itemClass(tone, active), disabled && "pointer-events-none opacity-50", className)}
      onClick={() => {
        onSelect?.();
        // A submit button must reach its form before the menu unmounts.
        if (type === "submit") setTimeout(() => ctx?.close(), 0);
        else ctx?.close();
      }}
    >
      {icon ? <span className="inline-flex shrink-0 text-fg-subtle">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="shrink-0 text-xs text-fg-subtle">{hint}</span> : null}
    </button>
  );
}

/** A menu entry that navigates. */
export function MenuLink({ href, icon, children, active }: { href: string; icon?: React.ReactNode; children: React.ReactNode; active?: boolean }) {
  const ctx = React.useContext(MenuContext);
  return (
    <Link href={href} role="menuitem" tabIndex={-1} className={itemClass("default", active)} aria-current={active ? "page" : undefined} onClick={() => ctx?.close()}>
      {icon ? <span className={cn("inline-flex shrink-0", active ? "text-accent" : "text-fg-subtle")}>{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden /> : null}
    </Link>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-1 pt-2 text-xs font-medium text-fg-subtle">{children}</div>;
}
