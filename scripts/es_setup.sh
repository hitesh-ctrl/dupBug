#!/usr/bin/env bash
# Download, verify and configure a local single-node Elasticsearch (macOS / Linux, no Docker).
# LOCAL DEVELOPMENT ONLY: security is disabled and the node binds to 127.0.0.1.
set -euo pipefail
ES_VERSION=8.19.25
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  PLAT=darwin-aarch64 ;;
  Darwin-x86_64) PLAT=darwin-x86_64 ;;
  Linux-x86_64)  PLAT=linux-x86_64 ;;
  Linux-aarch64) PLAT=linux-aarch64 ;;
  *) echo "unsupported platform $(uname -sm)" >&2; exit 1 ;;
esac
F="elasticsearch-$ES_VERSION-$PLAT.tar.gz"
BASE="https://artifacts.elastic.co/downloads/elasticsearch"
mkdir -p "$ROOT/tools" && cd "$ROOT/tools"
curl -fsSL -o "$F.sha512" "$BASE/$F.sha512"
if ! shasum -a 512 -c "$F.sha512" >/dev/null 2>&1; then
  curl -fsSL --retry 5 --retry-all-errors -C - -o "$F" "$BASE/$F"
fi
shasum -a 512 -c "$F.sha512"
ES_HOME="$ROOT/tools/elasticsearch-$ES_VERSION"
[ -d "$ES_HOME" ] || tar -xzf "$F"
cat > "$ES_HOME/config/elasticsearch.yml" <<YML
cluster.name: dupbug-local
node.name: dupbug-1
discovery.type: single-node
network.host: 127.0.0.1
http.port: 9200
# Local development only. Never expose this node to a network.
xpack.security.enabled: false
xpack.ml.enabled: false
YML
mkdir -p "$ES_HOME/config/jvm.options.d"
printf -- '-Xms1g\n-Xmx1g\n' > "$ES_HOME/config/jvm.options.d/heap.options"
echo "Elasticsearch $ES_VERSION ready in $ES_HOME"
