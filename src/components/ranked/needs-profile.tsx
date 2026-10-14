import Link from "next/link";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

/** Shown to a signed-in account that has no player profile yet: the journal belongs to a player. */
export function JournalNeedsProfile() {
  return (
    <div className="mx-auto max-w-3xl">
      <Panel>
        <PanelHeader title="Solo Queue Blocks" subtitle="Your private Solo/Duo improvement journal." />
        <PanelBody>
          <p className="text-sm text-fg">
            The journal is attached to your player profile. Complete it under{" "}
            <Link href="/me" className="text-accent hover:underline">
              My profile
            </Link>{" "}
            (display name and role take a minute), then come back here.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
