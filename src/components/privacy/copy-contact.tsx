"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { copyText } from "@/lib/copy-text";

/**
 * Copies the privacy contact's Discord username, to paste into Discord's Add Friend. Discord has no
 * address that opens a private message with someone, so the page offers the name, never a link.
 */
export function CopyDiscordUsername({ username }: { username: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (!(await copyText(username))) return void toast.error("Not copied", { description: `The Discord username is ${username}.` });
    setCopied(true);
    toast.success("Discord username copied.", { description: username });
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button size="sm" variant="outline" onClick={() => void copy()} aria-label={copied ? `Copied the Discord username ${username}` : `Copy the Discord username ${username}`} data-testid="privacy-discord-copy" data-copied={copied || undefined}>
      {copied ? <Check className="h-4 w-4 text-good" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
