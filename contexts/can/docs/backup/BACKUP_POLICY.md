# Google Drive Backup Policy

Backup is **on-demand copy**, not filesystem synchronization.

Transport: `rclone` using Google Drive API/OAuth.

Allowed project operation: `rclone copy`.

Behavior:
- new local file → upload;
- changed local file → remote updated;
- identical file → skipped;
- local deletion → remote remains;
- remote-only file → remains.

Project tooling must not use `rclone sync`.

Use dry-run before real backup.
`.backupignore` excludes re-creatable dependencies/build output, caches, logs, temp files, and secrets.
Remote cleanup is a separate explicit operation.
