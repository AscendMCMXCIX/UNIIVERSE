"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  /** What failed, in the user's words ("Riot data", "Trends"). */
  label: string;
  children: React.ReactNode;
  /** Compact: a one-line notice instead of a panel. */
  compact?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one failing panel from taking the page down: the rest of the dashboard renders, the
 * failed part shows what happened and a retry. Server-side errors inside the boundary's subtree
 * reach it as rendering errors in the client.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (typeof console !== "undefined") console.error(`[${this.props.label}]`, error.message);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const retry = () => this.setState({ error: null });
    if (this.props.compact) {
      return (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {this.props.label} could not be shown right now.{" "}
          <button type="button" onClick={retry} className="underline underline-offset-2">
            Retry
          </button>
        </p>
      );
    }
    return (
      <section className="rounded-lg border border-warn/40 bg-warn/5 p-4 text-sm">
        <div className="font-semibold text-warn">{this.props.label} is unavailable right now</div>
        <p className="mt-1 text-xs text-fg-muted">The rest of the page still works. {process.env.NODE_ENV !== "production" ? this.state.error.message : "The problem has been logged."}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={retry}>
          Retry
        </Button>
      </section>
    );
  }
}
