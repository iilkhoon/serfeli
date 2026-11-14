#!/usr/bin/env bash
# Nightly SQLite backup (qepik-backup.timer): a consistent online copy, gzipped, 14 days kept.
set -euo pipefail
DB="${DATABASE_PATH:-/var/lib/qepik/qepik.db}"
DIR="${BACKUP_DIR:-/var/backups/qepik}"
mkdir -p "$DIR"
OUT="$DIR/qepik-$(date +%Y-%m-%d-%H%M).db"
sqlite3 "$DB" ".backup '$OUT'"
sqlite3 "$OUT" "PRAGMA integrity_check;" | grep -qx ok
gzip -f "$OUT"
find "$DIR" -name 'qepik-*.db.gz' -mtime +14 -delete
echo "Yedək hazırdır: $OUT.gz ($(du -h "$OUT.gz" | cut -f1))"
