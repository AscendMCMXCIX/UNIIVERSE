"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createOpponentAction, deleteOpponentAction, updateOpponentAction } from "@/server/actions/opponents";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export function NewOpponentForm({ draftId, compact = false }: { draftId?: string; compact?: boolean }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await createOpponentAction({ name, draftId });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setName("");
        if (draftId) router.refresh();
        else router.push(`/opponents/${r.data.id}`);
      }}
    >
      <div className={compact ? "min-w-[220px]" : "min-w-[280px]"}>
        <Label htmlFor="opponentName">{draftId ? "Opponent team (new or existing name)" : "New opponent team"}</Label>
        <Input id="opponentName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name as shown in Clash" required maxLength={80} />
      </div>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "Saving…" : draftId ? "Use opponent" : "Create"}
      </Button>
      {error ? <p className="text-xs text-bad">{error}</p> : null}
    </form>
  );
}

export function OpponentDetailsForm({ opponent }: { opponent: { id: string; name: string; aliases: string[]; notes: string; archivedAt: Date | null } }) {
  const router = useRouter();
  const [name, setName] = React.useState(opponent.name);
  const [aliases, setAliases] = React.useState(opponent.aliases.join(", "));
  const [notes, setNotes] = React.useState(opponent.notes);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  return (
    <Panel>
      <PanelHeader title="TEAM" subtitle="Aliases help match names typed differently (e.g. tag vs full name)." actions={<Button size="sm" variant="danger" onClick={() => confirm("Delete this opponent? Saved matches keep the opponent name.") && deleteOpponentAction(opponent.id)}>Delete</Button>} />
      <PanelBody className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Aliases (comma separated)</Label>
          <Input value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tendencies, timings, anything useful next time." />
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); const r = await updateOpponentAction(opponent.id, { name, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), notes }); setBusy(false); setMessage(r.ok ? "Saved." : r.error); router.refresh(); }}>
            Save
          </Button>
          <Button variant="ghost" disabled={busy} onClick={async () => { await updateOpponentAction(opponent.id, { archived: !opponent.archivedAt }); router.refresh(); }}>
            {opponent.archivedAt ? "Restore" : "Archive"}
          </Button>
          {message ? <span className="text-xs text-fg-muted">{message}</span> : null}
        </div>
      </PanelBody>
    </Panel>
  );
}
