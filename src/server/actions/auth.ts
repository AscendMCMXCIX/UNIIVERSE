"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, roleForPassword, SESSION_COOKIE } from "@/server/auth/session";

export async function loginAction(_prev: { error: string } | undefined, formData: FormData): Promise<{ error: string }> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/team");
  const role = roleForPassword(password);
  if (!role) {
    // Small delay to blunt brute force attempts.
    await new Promise((r) => setTimeout(r, 400));
    return { error: "That password is not recognised." };
  }
  const token = await createSessionToken({ role, label: role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer (read-only)" });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith("/") ? next : "/team");
}
