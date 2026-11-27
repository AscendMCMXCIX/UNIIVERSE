import Link from "next/link";
import { requirePageAccess } from "@/server/auth/page-access";
import { getAppDb } from "@/server/bootstrap";
import { listAllNotes } from "@/server/matchup/notes-store";
import { loadMeetCounts } from "@/server/matchup/queue";
import { listChampions } from "@/server/repositories/champions";
import { PageHeader } from "@/components/ui/page-header";
import { MatchupNotesAdmin } from "@/components/admin/matchup-notes/matchup-notes-admin";

export const dynamic = "force-dynamic";

/**
 * Admin Mode → Platform Settings → Matchup notes (docs/MATCHUP_INTEL.md, "Curation"): the reviewed
 * notes Matchup Intel shows in Champion Intel's Compare, and the queue of what to write or re-check
 * first, by how often the team's members met each lane opponent and pairing this season. Champion
 * names and counts only. As stored now (the notes and their state are read afresh; the queue's
 * counts are cached for an hour).
 */
export default async function AdminMatchupNotesPage() {
  await requirePageAccess("manage-branding");
  const db = await getAppDb();
  const [all, meets, champions] = await Promise.all([listAllNotes(db), loadMeetCounts(db), listChampions(db)]);
  return (
    <div className="space-y-5">
      <PageHeader
        admin
        sectionNamed
        eyebrow="Platform Settings"
        title="Matchup notes"
        description={
          <>
            Short observations about two champions&apos; kits in one lane, written and reviewed here, shown in{" "}
            <Link href="/lookup" className="text-accent underline-offset-2 hover:underline">
              Champion Intel
            </Link>
            &apos;s Compare with that lane, labelled as reviewed notes. A note hides itself when Riot changes either champion, and after four patches.
          </>
        }
      />
      <MatchupNotesAdmin data={{ notes: all.notes, meets, champions: champions.map((c) => ({ id: c.id, name: c.name })), currentPatch: all.currentPatch, knownDesc: all.knownDesc }} />
    </div>
  );
}
