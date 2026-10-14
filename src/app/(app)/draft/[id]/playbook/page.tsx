import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { getDraft, toDraftState } from "@/server/repositories/drafts";
import { listChampions } from "@/server/repositories/champions";
import { playbookForDraft } from "@/server/engine/service";
import { deriveDraft } from "@/domain/draft";
import { QuickPlaybook } from "@/components/playbook/quick-playbook";
import { PlaybookPanel } from "@/components/playbook/playbook-panel";
import { Panel, PanelBody } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/**
 * The post-draft Match Playbook. Default: the Quick Playbook on one screen. `?view=detail`: the
 * detailed analysis (lanes, rules, scenarios, denial plan, self-critique), kept off the quick view.
 */
export default async function DraftPlaybookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await getAppDb();
  const [draft, champions, session] = await Promise.all([getDraft(db, id), listChampions(db), getSession()]);
  if (!draft) notFound();
  const derived = deriveDraft(toDraftState(draft));
  const playbook = derived.isComplete ? await playbookForDraft(db, draft) : null;
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  if (!playbook) {
    return (
      <Panel className="mx-auto max-w-xl">
        <PanelBody className="space-y-2 text-sm">
          <p>The playbook appears once the draft is complete.</p>
          <Link href={`/draft/${draft.id}`} className="text-accent hover:underline">
            Back to the draft room →
          </Link>
        </PanelBody>
      </Panel>
    );
  }
  const detail = sp.view === "detail";
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={`/draft/${draft.id}`} className="text-fg-muted hover:text-fg">
          ← Draft room
        </Link>
        <span className="text-fg-subtle">
          vs {draft.opponentName || "unknown opponent"} · {draft.side} side · patch {draft.patch}
        </span>
        {detail ? (
          <Link href={`/draft/${draft.id}/playbook`} className="text-accent hover:underline">
            ← Quick Playbook
          </Link>
        ) : null}
      </div>
      {detail ? (
        <PlaybookPanel playbook={playbook} championsById={championsById} title="Detailed analysis" myPlayerId={session?.playerId ?? null} />
      ) : (
        <QuickPlaybook playbook={playbook} championsById={championsById} ourPicks={derived.ourPicks.map((p) => p.championId)} enemyPicks={derived.enemyPicks.map((p) => p.championId)} myPlayerId={session?.playerId ?? null} detailHref={`/draft/${draft.id}/playbook?view=detail`} />
      )}
    </div>
  );
}
