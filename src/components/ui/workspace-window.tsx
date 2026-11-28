"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { DetailModal } from "./detail-modal";
import { Fold } from "./fold";
import { useWorkspace } from "./posture";
import { segmentClass, segmentedGroupClass } from "./segmented";

/*
  What a fold opens in the flow, in the one-screen workspace (docs/RESPONSIVE.md, "One-screen desktop
  pages": a detail opens without growing the page). Three ways, each the flow's own markup outside
  the workspace (phones, tablets, touch, short or narrow windows, a larger text size), unchanged:

  - WorkspaceWindow: in the workspace a row that opens a window holding the details (System Health's
    page speed by device and by page, its recent errors and job runs), one view at a time where it has
    several (`views`): a window that presents data fits the screen with no inner scroll. The flow's own
    presentation (`flow`: the details inline, or the fold that holds them) is drawn on the server and
    until the page knows its posture, hidden by the CSS gate in the workspace, and the row is drawn by
    the CSS gate from the first paint; once the workspace is known the flow's copy leaves the page, so
    the details are never in it twice.
  - WorkspaceOpenFold: a fold that is a workspace section's whole content (System Health's Riot
    compliance): open in the workspace, its title row kept. It opens once the page knows its posture
    (a fold's state is the browser's: no CSS can open it).
  - WorkspaceFlowFold: a fold round several workspace sections in the flow (System Health's Technical
    details): in the workspace its sections stand on their own (each one in the rail), so it draws them
    without the fold. Until the page knows its posture the fold is drawn, its title row hidden by the
    CSS gate in the workspace.

  And WorkspacePlaced: a part the workspace draws somewhere else than the flow does, in the markup
  where it is drawn (see below).
*/

export interface WorkspaceView {
  id: string;
  label: string;
  content: React.ReactNode;
}

/** The row a WorkspaceWindow opens from: a fold's row in look (its title, a line of description), a chevron to the right. */
const ROW = "flex min-h-9 w-full items-center justify-between gap-3 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-accent";

export function WorkspaceWindow({
  flow,
  label,
  description,
  title,
  windowDescription,
  views,
  children,
  testId,
  className,
}: {
  /** The flow's own presentation of the details (inline, or in its fold), as it always was. */
  flow: React.ReactNode;
  /** The row's words in the workspace ("Technical details"), and its line of description. */
  label: React.ReactNode;
  description?: React.ReactNode;
  /** The window's title (it names the window) and description. */
  title: string;
  windowDescription?: React.ReactNode;
  /** What the window shows: one view at a time where there are several (a switch above them), then `children` under every view. */
  views?: readonly WorkspaceView[];
  children?: React.ReactNode;
  /** The row's test id (`${testId}-open`) and the window's views' (`${testId}-view`). */
  testId: string;
  /** The row's own classes (its place in a panel: a rule above it). */
  className?: string;
}) {
  const ws = useWorkspace();
  const titleId = `workspace-window-${React.useId()}`;
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState(views?.[0]?.id ?? "");
  const shown = views?.find((v) => v.id === view) ?? views?.[0];
  return (
    <>
      <button type="button" className={cn(ROW, "hidden ws:flex", className)} onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid={`${testId}-open`}>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fg">{label}</span>
          {description ? <span className="block text-sm text-fg-muted">{description}</span> : null}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
      </button>
      {/* The flow's copy, after the row (the last of a spaced stack in the flow, as the fold it replaces was): hidden by the CSS
          gate in the workspace, and gone once the workspace is known. */}
      {ws === true ? null : <div className="ws:hidden">{flow}</div>}
      {ws === true ? (
        <DetailModal open={open} onClose={() => setOpen(false)} size="sheet" sheetWidth="table" title={title} titleId={titleId} description={windowDescription} closeTestId="dialog-close" testId={`${testId}-window`}>
          <div className="space-y-3">
            {views && views.length > 1 ? (
              <div role="group" aria-label={`${title}: views`} className={segmentedGroupClass()} data-testid={`${testId}-views`}>
                {views.map((v) => (
                  <button key={v.id} type="button" aria-pressed={v.id === shown?.id} className={segmentClass(v.id === shown?.id, { size: "md" })} onClick={() => setView(v.id)} data-testid={`${testId}-view`} data-view={v.id}>
                    {v.label}
                  </button>
                ))}
              </div>
            ) : null}
            {views ? shown?.content : null}
            {children}
          </div>
        </DetailModal>
      ) : null}
    </>
  );
}

type FoldProps = React.ComponentProps<typeof Fold>;

/** A fold that is a workspace section's whole content: open in the workspace (once known), its title row kept; the flow's fold otherwise. */
export function WorkspaceOpenFold({ defaultOpen = false, ...props }: FoldProps) {
  const ws = useWorkspace();
  return <Fold {...props} defaultOpen={defaultOpen || ws === true} />;
}

/** A fold round several workspace sections in the flow: in the workspace (once known) its content alone, each section on its own. */
export function WorkspaceFlowFold({ summaryClassName, className, ...props }: FoldProps) {
  const ws = useWorkspace();
  if (ws === true) return <>{props.children}</>;
  return <Fold {...props} className={cn(className, "ws:border-0 ws:bg-transparent")} summaryClassName={cn(summaryClassName, "ws:hidden")} />;
}

/**
 * A part the workspace draws in another place than the flow, in the markup at the place it is drawn,
 * so Tab and a screen reader follow the screen (WCAG 1.3.2 and 2.4.3; a CSS order would draw it in
 * one place and leave it in the other): System Health's Audit Logs line, before Riot compliance in the
 * flow and under the section shown in the workspace, Riot compliance included. The page draws it at
 * both places: at "flow" (with the ws: classes that draw it at the workspace's place for the first
 * paint, ws:order-last) and at "workspace". One of them is on the page at a time: the flow's on the
 * server, while hydrating and in the flow; the workspace's once the page knows it is there.
 */
export function WorkspacePlaced({ at, children }: { at: "flow" | "workspace"; children?: React.ReactNode }) {
  const ws = useWorkspace();
  return (at === "workspace") === (ws === true) ? <>{children}</> : null;
}
