#!/usr/bin/env bash
# End-to-end smoke test for the IntentRoute API.
#
#   scripts/smoke_test.sh                      start a local backend on a throwaway SQLite DB
#   scripts/smoke_test.sh --base-url URL       test an already-running backend (e.g. Render)
#   scripts/smoke_test.sh --skip-accuracy      skip step 6 (reported as skipped, never as passed)
#
# Env: PYTHON (interpreter, default: .venv's), SMOKE_PORT (local port, default 8765),
#      SMOKE_TIMEOUT (seconds to wait for /health, default 90: Render free tier cold starts),
#      MODEL_BACKEND / HF_* (passed through to the local backend).
#
# Persistence is proven by restarting the local server and reading the records back:
# /history and /feedback/list fall back to an in-memory log when the DB fails, so
# "visible right after writing" alone would not prove anything was stored.
# Exit code: 0 only if every step that ran passed.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE_URL=""
SKIP_ACCURACY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="${2%/}"; shift 2 ;;
    --skip-accuracy) SKIP_ACCURACY=1; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${PYTHON:-}" ]]; then
  for candidate in .venv/Scripts/python.exe .venv/bin/python python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 || [[ -x "$candidate" ]]; then PYTHON="$candidate"; break; fi
  done
fi
PORT="${SMOKE_PORT:-8765}"
TIMEOUT="${SMOKE_TIMEOUT:-90}"
WORK="$ROOT/.smoke"
SMOKE_DB="smoke-test.db"                      # relative to repo root; *.db is gitignored
TICKET_TEXT="I was charged once the trial ended even though I had removed my card"
RUN_ID="smoke-$(date +%s)-$RANDOM"
SERVER_PID=""
mkdir -p "$WORK"

GREEN=$'\e[32m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; BOLD=$'\e[1m'; RESET=$'\e[0m'
STEPS=(); RESULTS=()
record() { STEPS+=("$1"); RESULTS+=("$2"); }
pass() { echo "  ${GREEN}✔${RESET} $*"; }
fail() { echo "  ${RED}✘${RESET} $*"; }

# json_eval FILE EXPR -> prints the value of a Python expression over the parsed JSON `d`
json_eval() {
  "$PYTHON" - "$1" "$2" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    d = json.load(f)
v = eval(sys.argv[2], {"d": d})
print(json.dumps(v) if isinstance(v, (dict, list)) else v)
PY
}
# json_true FILE EXPR -> exit 0 if the expression is truthy
json_true() { [[ "$(json_eval "$1" "bool($2)")" == "True" ]]; }

# http METHOD PATH [JSON_BODY] -> body in $WORK/body.json, headers in $WORK/headers.txt, sets HTTP_CODE
http() {
  local args=(-sS -m 30 -o "$WORK/body.json" -D "$WORK/headers.txt" -w '%{http_code}' -X "$1"
              -H "X-Request-ID: $RUN_ID")
  [[ $# -ge 3 ]] && args+=(-H 'Content-Type: application/json' --data "$3")
  HTTP_CODE="$(curl "${args[@]}" "$BASE_URL$2" 2>"$WORK/curl.err")" || HTTP_CODE="000"
}

start_server() {
  DATABASE_URL="sqlite:///./$SMOKE_DB" ENVIRONMENT="smoke-test" \
    "$PYTHON" -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port "$PORT" \
    >>"$WORK/server.log" 2>&1 &
  SERVER_PID=$!
}
stop_server() {
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; fi
  SERVER_PID=""
}
wait_for_health() {
  local deadline=$((SECONDS + TIMEOUT))
  while (( SECONDS < deadline )); do
    if [[ -n "$SERVER_PID" ]] && ! kill -0 "$SERVER_PID" 2>/dev/null; then return 1; fi
    http GET /api/v1/health
    [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "503" ]] && return 0
    sleep 1
  done
  return 1
}
cleanup() { stop_server; [[ -z "$BASE_URL_GIVEN" ]] && rm -f "$ROOT/$SMOKE_DB"; }
BASE_URL_GIVEN="$BASE_URL"
trap cleanup EXIT

echo "${BOLD}IntentRoute smoke test${RESET}  (run id: $RUN_ID)"

# --- 1. backend up -------------------------------------------------------------------
echo "${BOLD}1. Backend${RESET}"
if [[ -z "$BASE_URL" ]]; then
  BASE_URL="http://127.0.0.1:$PORT"
  rm -f "$ROOT/$SMOKE_DB"; : >"$WORK/server.log"
  start_server
  if wait_for_health; then pass "started locally on $BASE_URL (DB: ./$SMOKE_DB, backend: ${MODEL_BACKEND:-sklearn})"; record "Backend starts" ok
  else fail "backend did not become ready; last log lines:"; tail -n 20 "$WORK/server.log"; record "Backend starts" fail
       echo; echo "${RED}${BOLD}Aborting: nothing else can run without a backend.${RESET}"; exit 1; fi
else
  if wait_for_health; then pass "reached $BASE_URL"; record "Backend reachable" ok
  else fail "no response from $BASE_URL/api/v1/health within ${TIMEOUT}s"; record "Backend reachable" fail; exit 1; fi
fi

# --- 2. health -----------------------------------------------------------------------
echo "${BOLD}2. GET /api/v1/health${RESET}"
http GET /api/v1/health
if [[ "$HTTP_CODE" == "200" ]] && json_true "$WORK/body.json" 'd["status"] == "ok"'; then
  pass "200, status=ok, backend=$(json_eval "$WORK/body.json" 'd["backend"]'), db=$(json_eval "$WORK/body.json" 'd["db"]')"
  record "Health is ok" ok
else
  fail "HTTP $HTTP_CODE: $(cat "$WORK/body.json" 2>/dev/null)"; record "Health is ok" fail
fi
if grep -qi "^x-request-id: $RUN_ID" "$WORK/headers.txt"; then pass "X-Request-ID echoed"; record "Request id echoed" ok
else fail "X-Request-ID not echoed"; record "Request id echoed" fail; fi

# --- 3. classify a holdout ticket ----------------------------------------------------
echo "${BOLD}3. POST /api/v1/classify${RESET}"
EXPECTED="$("$PYTHON" - "$TICKET_TEXT" <<'PY'
import json, sys
rows = json.load(open("backend/data/holdout.json", encoding="utf-8"))
print(next((r["label"] for r in rows if r["text"] == sys.argv[1]), ""))
PY
)"
if [[ -z "$EXPECTED" ]]; then
  fail "smoke ticket is no longer in backend/data/holdout.json"; record "Classify holdout ticket" fail
else
  BODY="$("$PYTHON" -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "ticket_id": sys.argv[2]}))' "$TICKET_TEXT" "$RUN_ID")"
  http POST /api/v1/classify "$BODY"
  cp "$WORK/body.json" "$WORK/classify.json" 2>/dev/null
  GOT="$(json_eval "$WORK/body.json" 'd.get("predicted_intent")' 2>/dev/null)"
  if [[ "$HTTP_CODE" == "200" && "$GOT" == "$EXPECTED" ]]; then
    pass "predicted '$GOT' (holdout label '$EXPECTED'), model $(json_eval "$WORK/body.json" 'd["model_version"]'), confidence $(json_eval "$WORK/body.json" 'd["confidence"]')"
    record "Classify holdout ticket" ok
  else
    fail "HTTP $HTTP_CODE, predicted '$GOT', holdout label '$EXPECTED'"; record "Classify holdout ticket" fail
  fi
fi

# --- 4. route -----------------------------------------------------------------------
echo "${BOLD}4. POST /api/v1/route${RESET}"
BODY="$("$PYTHON" -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "ticket_id": sys.argv[2] + "-route"}))' "$TICKET_TEXT" "$RUN_ID")"
http POST /api/v1/route "$BODY"
if [[ "$HTTP_CODE" == "200" ]] && json_true "$WORK/body.json" 'd["routed_team"] and d["priority"] and d["sla_hours"] > 0 and d["sla_label"]'; then
  pass "team='$(json_eval "$WORK/body.json" 'd["routed_team"]')' priority='$(json_eval "$WORK/body.json" 'd["priority"]')' SLA='$(json_eval "$WORK/body.json" 'd["sla_label"]')'"
  record "Route returns team/priority/SLA" ok
else
  fail "HTTP $HTTP_CODE: $(cat "$WORK/body.json" 2>/dev/null)"; record "Route returns team/priority/SLA" fail
fi

# --- 5. feedback + persistence ----------------------------------------------------------
echo "${BOLD}5. POST /api/v1/feedback -> persisted${RESET}"
PREDICTED="$(json_eval "$WORK/classify.json" 'd.get("predicted_intent", "")' 2>/dev/null || true)"
BODY="$("$PYTHON" -c 'import json,sys; print(json.dumps({"ticket_id": sys.argv[1], "text": sys.argv[2], "predicted_intent": sys.argv[3] or sys.argv[4], "correct_intent": sys.argv[4], "notes": "automated smoke test", "reviewer": "smoke-test"}))' "$RUN_ID" "$TICKET_TEXT" "$PREDICTED" "${EXPECTED:-Billing}")"
http POST /api/v1/feedback "$BODY"
if [[ "$HTTP_CODE" == "200" ]] && json_true "$WORK/body.json" 'd["status"] == "recorded"'; then pass "feedback recorded"
else fail "HTTP $HTTP_CODE: $(cat "$WORK/body.json" 2>/dev/null)"; fi
FEEDBACK_OK=$([[ "$HTTP_CODE" == "200" ]] && echo 1 || echo 0)

if [[ -z "$BASE_URL_GIVEN" ]]; then
  stop_server; start_server
  if wait_for_health; then pass "server restarted (in-memory logs cleared)"; else fail "server did not restart"; fi
  WHEN="after restart"
else
  WHEN="(remote: cannot restart; also relies on health db=ok)"
fi
http GET "/api/v1/history?limit=500"
IN_HISTORY=$(json_true "$WORK/body.json" "any(r.get('ticket_id') == '$RUN_ID' for r in d)" && echo 1 || echo 0)
http GET "/api/v1/feedback/list?limit=500"
IN_FEEDBACK=$(json_true "$WORK/body.json" "any(r.get('ticket_id') == '$RUN_ID' and r.get('reviewer') == 'smoke-test' for r in d)" && echo 1 || echo 0)
if [[ "$FEEDBACK_OK$IN_HISTORY$IN_FEEDBACK" == "111" ]]; then
  pass "prediction found in /history and feedback found in /feedback/list $WHEN"
  record "Feedback + prediction persisted" ok
else
  fail "persisted $WHEN: prediction in /history=$IN_HISTORY, feedback in /feedback/list=$IN_FEEDBACK"
  record "Feedback + prediction persisted" fail
fi

# --- 6. accuracy gate --------------------------------------------------------------------
echo "${BOLD}6. pytest test_model_accuracy.py -k sklearn${RESET}"
if (( SKIP_ACCURACY )); then
  echo "  ${YELLOW}⏭${RESET} skipped (--skip-accuracy)"; record "sklearn holdout accuracy gate" skip
else
  # The PYTHON path is relative to the repo root; resolve it before changing directory.
  PY_ABS="$(cd "$(dirname "$PYTHON")" 2>/dev/null && pwd)/$(basename "$PYTHON")"
  [[ "$PYTHON" == */* ]] || PY_ABS="$PYTHON"
  (cd backend && "$PY_ABS" -m pytest tests/test_model_accuracy.py -k sklearn -q -p no:warnings) >"$WORK/accuracy.log" 2>&1
  rc=$?
  grep -E "^backend=" "$WORK/accuracy.log" | sed 's/^/    /'
  if (( rc == 0 )); then pass "accuracy gate passed"; record "sklearn holdout accuracy gate" ok
  else fail "accuracy gate failed (pytest exit $rc; full output: .smoke/accuracy.log)"; record "sklearn holdout accuracy gate" fail; fi
fi

# --- summary --------------------------------------------------------------------------
echo; echo "${BOLD}Summary${RESET}"
FAILED=0
for i in "${!STEPS[@]}"; do
  case "${RESULTS[$i]}" in
    ok)   echo "  ✅ ${STEPS[$i]}" ;;
    skip) echo "  ⏭️  ${STEPS[$i]} (skipped)" ;;
    *)    echo "  ❌ ${STEPS[$i]}"; FAILED=$((FAILED + 1)) ;;
  esac
done
echo
if (( FAILED == 0 )); then
  echo "${GREEN}${BOLD}✅ All smoke checks passed.${RESET}"; exit 0
else
  echo "${RED}${BOLD}❌ $FAILED check(s) failed.${RESET}"; exit 1
fi
