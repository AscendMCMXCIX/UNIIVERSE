"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { attachOpponentAction } from "@/server/actions/drafts";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";

export function AttachOpponent({ draftId, opponents }: { draftId: string; opponents: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [id, setId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex items-end gap-2">
      <div>
        <Label>Or choose a saved opponent</Label>
        <Select value={id} onChange={(e) => setId(e.target.value)} className="w-56">
          <option value="">—</option>
          {opponents.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </div>
      <Button variant="outline" disabled={!id || busy} onClick={async () => { setBusy(true); await attachOpponentAction(draftId, id); setBusy(false); router.refresh(); }}>
        Attach
      </Button>
    </div>
  );
}
