import Link from "next/link";
import { BrandFrame } from "@/components/auth/brand-frame";

/** Invitation links are retired: admins create accounts and hand out temporary passwords instead. */
export default function InvitePage() {
  return (
    <BrandFrame eyebrow="INVITATION" width="max-w-md">
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Invitation links are no longer used</h1>
      <p className="mt-2 text-sm text-fg-muted">Accounts are created by an admin, who gives you a username and a temporary password. Sign in with those on the normal sign-in page and choose your own password.</p>
      <Link href="/login" className="mt-4 inline-block text-sm text-accent hover:underline">
        Go to sign in →
      </Link>
    </BrandFrame>
  );
}
