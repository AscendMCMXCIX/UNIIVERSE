# Security

UNIIVERSE is a private team platform whose source code is public. The code, its history, the
pull requests, the issues, the Actions logs and the Actions artifacts can all be read by anyone.
The team's data, the production settings and every credential live elsewhere (Vercel, Supabase,
GitHub's encrypted secrets, Riot's Developer Portal) and never in this repository.

## Reporting a vulnerability

Please report it privately: **Security → Report a vulnerability** on this repository (GitHub's
private vulnerability reporting). Do not open a public issue or pull request that describes it.
If that button is not there, open an issue that only asks for a private contact, with no details.

Include what you found, how to reproduce it and what it exposes. Please do not test against the
production site beyond what is needed to show the problem, and never read, change or keep another
person's data.

## Rules for everyone who changes this repository

- **No secrets, ever:** no API key, token, password, connection string or private key in a commit,
  a pull request, an issue, a comment or a log. Real values go in Vercel's environment variables or
  in GitHub's repository secrets; `.env.example` holds placeholders only, and `.env*` files are
  ignored. GitHub's secret scanning and push protection are on; a blocked push means a secret was
  about to be published, so remove it rather than bypassing the block.
- **No personal data:** no player's Riot ID, PUUID, username, email or game record from production
  in code, fixtures, screenshots or docs. Tests use invented names (`Alice#OCE`, `RGAPI-0000…`).
- **Logs and artifacts are public:** a workflow must not print personal data or a secret, and
  must not upload anything unencrypted that came from production. A job's answer printed in a log is
  checked for this when the job changes.
- **Workflows that run on pull requests** never receive secrets and never use
  `pull_request_target`. Each workflow states the smallest `permissions` it needs, and third-party
  actions are pinned to a commit.
- **A secret that was published is compromised**, even if the commit is deleted at once: revoke and
  rotate it at its source first, then clean up.

## Where things are documented

- What the workflows may do and what they cost: `docs/CI_USAGE.md`.
- Database roles and grants: `docs/DATABASE_PERMISSIONS.md`.
- Backups, their encryption and how to restore one: `docs/BACKUPS.md`.
- The security rules for code: `docs/STANDARDS.md`.
