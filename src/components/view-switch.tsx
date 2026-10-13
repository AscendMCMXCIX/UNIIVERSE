import { ShieldCheck, Undo2 } from "lucide-react";
import { switchViewAction } from "@/server/actions/view-mode";
import { cn } from "@/lib/cn";

/** The Player View ↔ Admin Mode switch (owners only). A plain form, so it works everywhere. */
export function ViewSwitch({ adminMode, className, large = false }: { adminMode: boolean; className?: string; large?: boolean }) {
  return (
    <form action={switchViewAction} className={className}>
      <input type="hidden" name="mode" value={adminMode ? "player" : "admin"} />
      <button
        type="submit"
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-3 text-left text-sm transition-colors",
          large ? "min-h-11" : "min-h-9",
          adminMode ? "border-accent/50 bg-accent/10 text-accent-strong hover:bg-accent/15" : "border-border text-fg-muted hover:bg-surface-2 hover:text-fg",
        )}
        title={adminMode ? "Back to the normal player experience" : "Open the Admin area"}
      >
        {adminMode ? <Undo2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        {adminMode ? "Back to Player View" : "Switch to Admin"}
      </button>
    </form>
  );
}
