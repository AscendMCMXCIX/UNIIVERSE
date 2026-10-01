/**
 * Resets an account's password from the command line, for the case where the owner is locked
 * out (no email-based reset exists by design: the app sends no email).
 *
 *   pnpm user:reset-password owner@example.com            → prints a generated temporary password
 *   pnpm user:reset-password owner@example.com 'NewPass123' → sets the given password
 *
 * Runs against DATABASE_URL from .env.local (or the embedded local database when unset).
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const [email, given] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: pnpm user:reset-password <email> [new-password]");
    process.exit(1);
  }
  const { createDb } = await import("@/server/db/create");
  const { findUserByEmail, setPassword } = await import("@/server/repositories/users");
  const { temporaryPassword, validatePasswordStrength } = await import("@/server/auth/password");
  const handle = await createDb();
  try {
    const user = await findUserByEmail(handle.db, email);
    if (!user) {
      console.error(`No account with email ${email}`);
      process.exit(1);
    }
    const password = given ?? temporaryPassword();
    const weak = validatePasswordStrength(password);
    if (weak) {
      console.error(weak);
      process.exit(1);
    }
    await setPassword(handle.db, user.id, password);
    console.log(`Password reset for ${user.email} (${user.role}).`);
    if (!given) console.log(`Temporary password: ${password}`);
    console.log("Sign in with it and change it under My profile.");
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
