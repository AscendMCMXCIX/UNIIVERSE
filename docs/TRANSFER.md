# A new install, or handing this one over

Two situations, both on the free plans. Nothing here costs money.

- **A new install for another team.** It starts with neutral names ("Team Hub") and no images. The Owner sets their own in Admin → Branding.
- **This install changing hands.** A new owner takes over the GitHub repository, the Vercel project and the Supabase project, and replaces every secret.

This is a technical checklist, not legal advice. Before anyone else runs UNIIVERSE, read the "Legal and compliance" section of the modernisation audit and `docs/RIOT_COMPLIANCE.md`. In short:
- Riot's terms allow non-commercial use only.
- A Riot API key belongs to the developer account that registered it.
- Members' personal data (usernames, display names, pictures, Riot IDs, game history) moves with the database.

## A new install

1. Follow `docs/DEPLOYMENT.md` from the start: a new Supabase project, your own Riot key, and a new Vercel project from your copy of the repository.
2. Open `/setup` with your `UNIIVERSE_ACCESS_PASSWORD` and create the Owner account.
3. **Admin → Branding:**
   - **App name:** what the app calls itself in tab titles, the installed app, the welcome screens and Riot's notice. New installs start with "Team Hub".
   - **Team name and short name:** the sidebar, the sign-in page and "Member of the … team".
   - Colours, logo and backgrounds as you like. "Reset colours to defaults" never changes the names.
4. Add accounts in Admin → People.

Nothing of the original team comes with the code: no accounts, players, games or images. Those live only in the original database.

## Handing this install over

Do these in order; each step keeps the app working.

1. **Back up first.** Take a backup and prove it restores (`docs/BACKUPS.md`). Keep it encrypted: it holds password hashes and personal data.
2. **GitHub.** Transfer the repository (Settings → Danger Zone → Transfer). The new owner checks that the repository secrets `APP_URL` and `CRON_SECRET` came across, and re-enables the Data jobs workflow if GitHub paused it.
3. **Vercel.** Transfer the project to the new owner's team (Project → Settings → General → Transfer), or have them import the repository into a new project with the same environment variables.
4. **Supabase.** Transfer the project to the new owner's organisation (Project Settings → General → Transfer project). The database, and so every account and game, moves with it.
5. **Replace every secret**, so the previous owner keeps no access:
   - `UNIIVERSE_AUTH_SECRET`: required in production. Sessions are random tokens stored as hashes, so a new value signs no one out; step 6 does that.
   - `UNIIVERSE_ACCESS_PASSWORD`: the setup and recovery key.
   - `CRON_SECRET`: in Vercel and as the GitHub repository secret.
   - The Supabase database password, then `DATABASE_URL` in Vercel.
   - `RIOT_API_KEY`: the new owner registers their own product with Riot.
   - Redeploy after changing them.
6. **The Owner account.** The new owner signs in with the existing Owner account and changes its password, which ends its sessions on every other browser. If no one knows the password, use owner recovery at `/recover` with the new setup key.
7. **Branding.** The new owner may rename the app and the team in Admin → Branding; nothing else depends on the names.
8. **Check.** Run Data jobs `smoke perf-probe auth-audit` once. It should show the new deployment's commit, no failing jobs, and the expected number of accounts.

## What stays with the code

- The names "UNIIVERSE" and "Team Hub" appear only as defaults:
  - this install keeps "UNIIVERSE" because migration `0044_keep_product_name` stored it;
  - a new install shows "Team Hub" until its Owner changes it.
- Environment variable names still start with `UNIIVERSE_`. They are configuration, never shown to users.
