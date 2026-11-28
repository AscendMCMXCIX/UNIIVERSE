import { redirect } from "next/navigation";

/**
 * The public team page has no switch any more (it is always on): the old Admin address stays in Admin
 * Mode, at Branding's Public team page section (?section=public: the workspace shows it; #brand-public:
 * the flow scrolls to it).
 */
export default function AdminPublicAccessPage() {
  redirect("/admin/branding?section=public#brand-public");
}
