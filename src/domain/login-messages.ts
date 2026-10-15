/** The sign-in error a person sees (the real sign-in and Admin → Previews use the same words). */
export function explainLoginFailure(login: string): string {
  if (login.includes("@")) return "Sign in with your username, not an email address: UNIIVERSE has no email login. Accounts created before usernames existed use their former display name as the username. Owners who are unsure can use owner recovery (link below).";
  return "Username or password not recognised. Forgot your password? Ask an admin to issue a temporary one. Owners who forgot their username or password can use owner recovery (link below).";
}
