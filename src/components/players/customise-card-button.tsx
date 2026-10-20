"use client";

import * as React from "react";
import { Loader2, Paintbrush } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { CustomiseCardProps } from "./customise-card";

/** The Studio's code (its editor, champion grid and preview): fetched when wanted, not with the page. */
const loadStudio = () => import("./customise-card");
const CardStudio = React.lazy(() => loadStudio().then((m) => ({ default: m.CardStudio })));
/** Starts fetching the Studio early (the button pointed at, focused or pressed); a failure shows when it opens. */
const preload = () => {
  loadStudio().catch(() => {});
};

/**
 * The Customise button on a card the viewer may edit (their own on Team, Players and the profile
 * header; any card for a player manager) and the Player Card Studio it opens. A page that shows
 * the button carries only the button: the Studio is fetched when the button is pointed at,
 * focused or pressed, so no page (the public team page included, where nobody can customise)
 * downloads it for nothing. While it loads, the button shows it is busy and the page stays as it
 * was (the opening is a transition, so nothing is replaced by a loading state).
 */
export function CustomiseCardButton(props: CustomiseCardProps & { variant?: "overlay" | "outline" | "icon"; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const icon = props.variant === "icon";
  const Icon = pending ? Loader2 : Paintbrush;
  return (
    <>
      <button
        type="button"
        onPointerEnter={preload}
        onPointerDown={preload}
        onFocus={preload}
        onClick={() => startTransition(() => setOpen(true))}
        aria-busy={pending || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
          icon ? "h-8 w-8 rounded-full bg-bg/80 text-fg-muted hover:bg-bg/90 hover:text-accent pointer-coarse:h-11 pointer-coarse:w-11" : "min-h-9 px-2.5 pointer-coarse:min-h-11",
          !icon && (props.variant === "outline" ? "border border-border-strong bg-surface/70 text-fg hover:border-accent hover:text-accent" : "bg-bg/80 text-fg hover:bg-bg/90 hover:text-accent"),
          props.className,
        )}
        aria-label="Customise profile card"
        title="Player Card Studio: artwork, colours, frame, identity and effects"
        data-testid="customise-card"
      >
        <Icon className={cn(icon ? "h-4 w-4" : "h-3.5 w-3.5", pending && "animate-spin")} aria-hidden /> {icon ? null : <span>Customise</span>}
      </button>
      {open ? (
        <StudioBoundary
          onFail={() => {
            setOpen(false);
            toast.error("Card Studio could not be opened.", { description: "Check the connection, then reload the page and try again." });
          }}
        >
          <CardStudio {...props} onClose={() => setOpen(false)} />
        </StudioBoundary>
      ) : null}
    </>
  );
}

/** A Studio that fails to load (or to render) closes again with a notice instead of taking the page down. */
class StudioBoundary extends React.Component<{ onFail: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
