"use client";

import * as React from "react";
import { changeOwnPasswordAction } from "@/server/actions/users";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export function ChangePasswordPanel() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Panel>
      <PanelHeader title="PASSWORD" />
      <PanelBody className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="current">Current password</Label>
          <Input id="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>
        <div>
          <Label htmlFor="next">New password</Label>
          <Input id="next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </div>
        <Button
          variant="outline"
          disabled={busy || !current || !next}
          onClick={async () => {
            setBusy(true);
            const r = await changeOwnPasswordAction({ current, next });
            setBusy(false);
            setMessage(r.ok ? { tone: "good", text: "Password changed." } : { tone: "bad", text: r.error });
            if (r.ok) {
              setCurrent("");
              setNext("");
            }
          }}
        >
          Change password
        </Button>
        {message ? <p className={message.tone === "good" ? "text-xs text-good" : "text-xs text-bad"}>{message.text}</p> : null}
      </PanelBody>
    </Panel>
  );
}
