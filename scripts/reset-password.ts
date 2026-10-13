/**
 * Owner recovery: sets a new password for an account by username directly in the database, for
 * when the owner is locked out (there is no email-based reset by design: the app has no email).
 * Run on a machine with the production DATABASE_URL in .env.local:
 *   pnpm user:reset-password <username> [new-password]
 * Every session of that account is signed out.
 */
import "dotenv/config";

async function main() {
  const [login, given] = process.argv.slice(2);
  if (!login) {
    console.error("Usage: pnpm user:reset-password <username> [new-password]");
    process.exit(1);
  }
  const { createDb } = await import("@/server/db/create");
  const { findUserByLogin, setPassword } = await import("@/server/repositories/users");
  const { temporaryPassword, validatePasswordStrength } = await import("@/server/auth/password");
  const handle = await createDb();
  try {
    const user = await findUserByLogin(handle.db, login);
    if (!user) {
      console.error(`No account with username ${login}`);
      process.exit(1);
    }
    const password = given ?? temporaryPassword();
    const weak = validatePasswordStrength(password);
    if (weak) {
      console.error(weak);
      process.exit(1);
    }
    await setPassword(handle.db, user.id, password);
    console.log(`Password reset for @${user.username} (${user.role}). All of their devices are signed out.`);
    if (!given) console.log(`Temporary password: ${password}`);
  } finally {
    await handle.close();
  }
}

void main();
