import Link from "next/link";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

/** Shown to a signed-in account without a player profile: Ranked Development belongs to a player. */
export function DevelopmentNeedsProfile() {
  return (
    <div className="mx-auto max-w-3xl">
      <Panel>
        <PanelHeader title="Ranked Development" subtitle="Your private Solo/Duo practice: objectives, sessions and reviews." />
        <PanelBody>
          <p className="text-sm text-fg">
            Ranked Development is attached to your player profile. Complete it under{" "}
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
