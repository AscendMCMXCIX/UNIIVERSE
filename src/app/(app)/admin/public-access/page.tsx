import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getPublicAccess, publicRiotDataAllowed } from "@/server/public/access";
import { listPublicProfileMembers } from "@/server/public/team";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PublicAccessSwitch } from "@/components/admin/public-access-panel";

export const dynamic = "force-dynamic";

/** What the public page holds, and what never leaves the team (the same rules the server enforces). */
const SHOWN = [
  { label: "Team Overview", detail: "The team's name, logo and the five lineup roles." },
  { label: "Member cards", detail: "Name, profile picture, player card, roles and champion pools, for members who made their profile public. Everyone else is shown by role only." },
];
const PRIVATE = ["Team and personal Match History, Matchups and Encounters", "Solo Queue Blocks and notes", "Riot accounts and their management", "Lineup and team management, Admin pages", "Sign-in, passwords and account settings"];

/** Admin → Public Access: the team-wide switch for the public pages, who appears on them, and what they show. */
export default async function AdminPublicAccessPage() {
  await requirePageAccess("manage-users");
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [access, members] = await Promise.all([getPublicAccess(db), listPublicProfileMembers(db, team.id)]);
  const riot = publicRiotDataAllowed();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Public Access" description="A read-only page about the team for visitors without an account. Each member decides for themselves whether they appear on it; this switch never overrides that." />
      <Panel>
        <PanelHeader title="Public team page" subtitle={access.enabled ? "On: anyone with the link can open it." : "Off: only signed-in members can open it, as a preview."} actions={<Badge tone={access.enabled ? "good" : "neutral"}>{access.enabled ? "On" : "Off"}</Badge>} />
        <PanelBody className="space-y-3">
          <PublicAccessSwitch on={access.enabled} />
          <Link href="/public" target="_blank" className={buttonClass("outline", "sm")} data-testid="public-preview">
            Preview as a visitor <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <p className="text-xs text-fg-muted">The preview is the same page visitors get: it is built only from what is public, whoever opens it.</p>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Members on the public page" subtitle={`${members.members.length} of ${members.total} team members chose to appear. Only they can change it, in their own Settings.`} />
        <PanelBody>
          {members.members.length ? (
            <ul className="flex flex-wrap gap-2" data-testid="public-members">
              {members.members.map((m) => (
                <li key={m.id}>
                  <Badge tone="neutral">{m.name}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted" data-testid="public-members-empty">
              Nobody yet. Until members choose to appear, the public page shows the five roles without names or pictures.
            </p>
          )}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="What visitors can see" />
        <PanelBody className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-fg">Shown</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {SHOWN.map((s) => (
                <li key={s.label}>
                  <span className="font-medium text-fg">{s.label}</span>
                  <span className="block text-xs text-fg-muted">{s.detail}</span>
                </li>
              ))}
              <li>
                <span className="font-medium text-fg">Ranks and statistics</span>
                <span className="block text-xs text-fg-muted">{riot ? "Allowed by this deployment's setting." : "Not shown. They come from Riot's API, which does not allow a development or personal key to serve them publicly; they stay for members only."}</span>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-fg">Always private</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">
              {PRIVATE.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
