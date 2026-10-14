import { requirePageAccess } from "@/server/auth/page-access";

export const dynamic = "force-dynamic";

/** Every page of one draft (room, scouting, preparation, playbook) belongs to the team workspace. */
export default async function DraftLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess("view-matches", "create-draft");
  return children;
}
