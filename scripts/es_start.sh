#!/usr/bin/env bash
# Start the local Elasticsearch node and wait until the cluster answers (polls health, no fixed sleep).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ES_HOME="$ROOT/tools/elasticsearch-8.19.25"
PID="$ROOT/tools/es.pid"
URL="http://127.0.0.1:9200"
if curl -fs "$URL" >/dev/null 2>&1; then echo "already running at $URL"; exit 0; fi
[ -x "$ES_HOME/bin/elasticsearch" ] || { echo "run scripts/es_setup.sh first" >&2; exit 1; }
"$ES_HOME/bin/elasticsearch" -d -p "$PID" >/dev/null 2>&1
for _ in $(seq 1 120); do
  if curl -fs "$URL/_cluster/health?wait_for_status=yellow&timeout=1s" >/dev/null 2>&1; then
    curl -fs "$URL/_cluster/health?filter_path=cluster_name,status,number_of_nodes"; echo; exit 0
  fi
  sleep 1
done
echo "Elasticsearch did not become healthy; see $ES_HOME/logs" >&2; exit 1
