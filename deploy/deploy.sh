#!/usr/bin/env bash
# Deploys the latest main: pull, install, build, restart. Run as root on the server:
#   sudo /srv/qepik/deploy/deploy.sh [branch]
# Migrations run on service start (ExecStartPre in qepik.service).
set -euo pipefail
BRANCH="${1:-main}"
APP=/srv/qepik
as_app() { sudo -u qepik -H bash -lc "cd $APP && $*"; }

as_app "git fetch --prune origin && git checkout -q $BRANCH && git reset -q --hard origin/$BRANCH"
as_app "npm ci --no-audit --no-fund"
as_app "npm run build"
systemctl restart qepik
sleep 3
systemctl is-active --quiet qepik
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/robots.txt; then
    echo "Deploy hazırdır: $(as_app 'git log --oneline -1')"
    exit 0
  fi
  sleep 1
done
echo "Server cavab vermir. Loq: journalctl -u qepik -n 100" >&2
exit 1
