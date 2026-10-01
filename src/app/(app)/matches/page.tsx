import { Panel, PanelBody } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

export default function MatchesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-xl font-bold">Matches</h1>
      <Panel>
        <PanelBody className="text-sm text-fg-muted">Completed drafts are archived here as match records.</PanelBody>
      </Panel>
    </div>
  );
}
