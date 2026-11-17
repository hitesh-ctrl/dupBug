#!/usr/bin/env bash
# One-time setup of a small Ubuntu VM (written for Oracle Cloud Always Free, Ubuntu 24.04, ARM or x86).
# Run from the repository root on the VM, as the normal login user (not root):
#
#   cp .env.example .env   # put a read-only GitHub token into GITHUB_TOKEN
#   deploy/setup_vm.sh
#
# What it does: installs Node 22 and Python tooling, installs and configures Elasticsearch (localhost only),
# downloads the issue text listed in manifest/, builds the index, and installs two systemd services
# (dupbug-es, dupbug-api) so the site comes back after a reboot. The API listens on port 80.
# Safe to run again.
set -euo pipefail

NODE_VERSION=22.23.5
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="$(id -un)"
ES_HOME="$ROOT/tools/elasticsearch-8.19.25"
cd "$ROOT"

[ "$RUN_USER" != root ] || { echo "run as a normal user with sudo rights, not as root" >&2; exit 1; }
grep -q '^GITHUB_TOKEN=..' .env 2>/dev/null || { echo "put GITHUB_TOKEN into .env first (see .env.example)" >&2; exit 1; }

echo "== 1/7 system packages"
sudo apt-get update -y
sudo apt-get install -y curl git xz-utils python3 python3-venv perl iptables-persistent

echo "== 2/7 Node $NODE_VERSION"
case "$(uname -m)" in
  aarch64) NODE_ARCH=arm64 ;;
  x86_64)  NODE_ARCH=x64 ;;
  *) echo "unsupported CPU $(uname -m)" >&2; exit 1 ;;
esac
if [ "$(/opt/node/bin/node -v 2>/dev/null || true)" != "v$NODE_VERSION" ]; then
  TARBALL="node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz"
  TMP="$(mktemp -d)"
  curl -fsSL -o "$TMP/$TARBALL" "https://nodejs.org/dist/v$NODE_VERSION/$TARBALL"
  curl -fsSL -o "$TMP/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  (cd "$TMP" && grep " $TARBALL\$" SHASUMS256.txt | sha256sum -c -)
  sudo rm -rf /opt/node && sudo mkdir -p /opt/node
  sudo tar -xJf "$TMP/$TARBALL" -C /opt/node --strip-components=1
  rm -rf "$TMP"
fi
export PATH="/opt/node/bin:$PATH"
node -v

echo "== 3/7 project dependencies"
npm ci
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt

echo "== 4/7 Elasticsearch (download, checksum, config)"
scripts/es_setup.sh

echo "== 5/7 systemd services"
sudo tee /etc/systemd/system/dupbug-es.service >/dev/null <<UNIT
[Unit]
Description=Duplicate Report Finder: Elasticsearch (localhost only)
After=network.target

[Service]
Type=forking
User=$RUN_USER
PIDFile=$ROOT/tools/es.pid
ExecStart=$ES_HOME/bin/elasticsearch -d -p $ROOT/tools/es.pid
LimitNOFILE=65535
TimeoutStartSec=180
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/dupbug-api.service >/dev/null <<UNIT
[Unit]
Description=Duplicate Report Finder: API and page
After=dupbug-es.service
Wants=dupbug-es.service

[Service]
User=$RUN_USER
WorkingDirectory=$ROOT
Environment=HOST=0.0.0.0
Environment=PORT=80
Environment=RATE_LIMIT_PER_MIN=30
Environment=ES_URL=http://127.0.0.1:9200
ExecStart=/opt/node/bin/node --import tsx src/server.ts
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable dupbug-es dupbug-api

echo "== 6/7 start Elasticsearch, fetch issues, build the index"
sudo systemctl restart dupbug-es
for _ in $(seq 1 120); do
  curl -fs "http://127.0.0.1:9200/_cluster/health?wait_for_status=yellow&timeout=1s" >/dev/null 2>&1 && break
  sleep 1
done
curl -fs "http://127.0.0.1:9200/_cluster/health?filter_path=status" || { echo "Elasticsearch did not start; see $ES_HOME/logs" >&2; exit 1; }
echo
[ -f data/issues.jsonl ] || .venv/bin/python scripts/fetch_issues.py --from-manifest
npm run -s index

echo "== 7/7 open port 80 on the VM firewall and start the site"
sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save
sudo systemctl restart dupbug-api
for _ in $(seq 1 50); do curl -fs http://127.0.0.1/health >/dev/null 2>&1 && break; sleep 0.2; done
curl -fs http://127.0.0.1/health && echo
echo "Done. If the cloud firewall (security list) allows TCP 80, the page is at: http://$(curl -fs --max-time 5 https://api.ipify.org || echo '<public IP>')/"
