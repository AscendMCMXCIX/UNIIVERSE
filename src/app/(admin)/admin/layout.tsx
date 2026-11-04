export const dynamic = "force-dynamic";

/** The Admin Mode pages' column (the mode itself, and who may open it, is src/app/(admin)/layout.tsx). */
export default function AdminPagesLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[var(--content-max)] space-y-5">{children}</div>;
}
