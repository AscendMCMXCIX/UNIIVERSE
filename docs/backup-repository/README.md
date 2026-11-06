# uniiverse-backups (private)

This directory holds the files for the **private** repository `AscendMCMXCIX/uniiverse-backups`, which keeps UNIIVERSE's encrypted database backups where only people with access to it can download them. They are kept here, in the public repository, so they are reviewed and versioned with the backup script they run. They contain no secrets and no data. Nothing in this directory runs here: GitHub only runs workflows from a repository's own `.github/workflows`.

| File | What it does |
|---|---|
| `.github/workflows/backup.yml` | Weekly (Mondays 02:43 UTC) and by hand: checks out UNIIVERSE's `main`, runs `scripts/backup-db.sh` (read-only role check, dump, restore check, AES-256 encryption) and keeps the encrypted backup 28 days as an artifact of the run. |
| `.github/workflows/backup-age.yml` | Daily: fails, and opens a `database-backup` issue, when no backup has passed within 8 days. |

The private repository needs only these two workflow files and two secrets: `BACKUP_DATABASE_URL` and `BACKUP_PASSPHRASE`. The setup steps and the cutover are in `docs/BACKUPS.md`, "Where backups are kept".
