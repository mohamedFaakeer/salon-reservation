#!/usr/bin/env bash
#
# Pre-demo smoke test (DEPLOYMENT.md §8).
#
# Wakes the three Render free-tier services (which sleep after ~15 min idle,
# costing 30-60 s on the first hit) and proves the customer-critical path is
# actually working — not merely that the processes are up.
#
# Usage:
#   npm run smoke                                           # the live deployment
#   npm run smoke:local                                     # local dev defaults
#   scripts/smoke-demo.sh https://api… https://web… https://admin… [slug]
#
# Or via env vars: API_URL, WEB_URL, ADMIN_URL, DEMO_SLUG.
#
# Exit code is 0 only if every check passes, so this is safe to use in CI or a
# pre-demo checklist.

set -uo pipefail

API_URL="${1:-${API_URL:-http://localhost:3000}}"
WEB_URL="${2:-${WEB_URL:-http://localhost:3001}}"
ADMIN_URL="${3:-${ADMIN_URL:-http://localhost:3002}}"
# Slug is a 4th positional arg as well as an env var: npm scripts run through
# cmd.exe on Windows, where `DEMO_SLUG=x cmd` is a syntax error.
DEMO_SLUG="${4:-${DEMO_SLUG:-elegance}}"

# Render cold starts can take a full minute; don't fail on a slow wake-up.
CURL_TIMEOUT="${CURL_TIMEOUT:-90}"

pass=0
fail=0

if [ -t 1 ]; then
  GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=""; RED=""; DIM=""; BOLD=""; RESET=""
fi

ok()   { printf '  %sPASS%s  %s\n' "$GREEN" "$RESET" "$1"; pass=$((pass + 1)); }
bad()  { printf '  %sFAIL%s  %s\n' "$RED" "$RESET" "$1"; fail=$((fail + 1)); }
note() { printf '        %s%s%s\n' "$DIM" "$1" "$RESET"; }

# check_status <label> <url> <expected-codes-regex>
check_status() {
  local label="$1" url="$2" expect="$3" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null)
  if [[ "$code" =~ $expect ]]; then
    ok "$label ${DIM}($code)${RESET}"
  else
    bad "$label — got ${code:-no response}, expected $expect"
    note "$url"
  fi
}

printf '\n%sSalon reservation — pre-demo smoke test%s\n' "$BOLD" "$RESET"
note "api=$API_URL  web=$WEB_URL  admin=$ADMIN_URL  slug=$DEMO_SLUG"
printf '\n%sWaking services%s\n' "$BOLD" "$RESET"

check_status "API health"          "$API_URL/api/v1/health"          '^200$'
check_status "Customer app"        "$WEB_URL"                        '^(200|3[0-9]{2})$'
check_status "Admin app login"     "$ADMIN_URL/login"                '^(200|3[0-9]{2})$'

printf '\n%sCustomer-critical path%s\n' "$BOLD" "$RESET"

# The demo salon must be publicly resolvable by slug, with services attached.
salon=$(curl -s --max-time "$CURL_TIMEOUT" "$API_URL/api/v1/salons/$DEMO_SLUG" 2>/dev/null)
service_id=$(printf '%s' "$salon" | sed -n 's/.*"services":\[{"id":"\([^"]*\)".*/\1/p')

if [ -n "$service_id" ]; then
  ok "Salon '$DEMO_SLUG' resolves and exposes services"
else
  bad "Salon '$DEMO_SLUG' returned no services — has it been demo-seeded?"
  note "POST $API_URL/api/v1/super-admin/tenants/<id>/demo-seed"
fi

# One real availability query. This is the query that must feel instant during a
# demo, and it is also the cheapest end-to-end proof that the API, the database
# and the availability engine are all healthy together.
if [ -n "$service_id" ]; then
  slots_found=""
  for offset in 1 2 3 4 5 6 7; do
    if date -v+1d >/dev/null 2>&1; then
      target=$(date -v+"${offset}"d +%Y-%m-%d)          # BSD/macOS
    else
      target=$(date -d "+${offset} days" +%Y-%m-%d)     # GNU/Linux, Git Bash
    fi
    body=$(curl -s --max-time "$CURL_TIMEOUT" -X POST \
      "$API_URL/api/v1/salons/$DEMO_SLUG/availability" \
      -H 'Content-Type: application/json' \
      -d "{\"serviceIds\":[\"$service_id\"],\"date\":\"$target\"}" 2>/dev/null)
    # A day with no slots is legitimate (Sunday, fully booked) — keep scanning.
    if printf '%s' "$body" | grep -q '"start"'; then
      slots_found="$target"
      break
    fi
  done

  if [ -n "$slots_found" ]; then
    ok "Availability returns bookable slots ${DIM}($slots_found)${RESET}"
  else
    bad "No bookable slots in the next 7 days"
    note "Staff schedules missing, or every day is closed/full."
  fi
fi

printf '\n'
if [ "$fail" -eq 0 ]; then
  printf '%sAll %d checks passed — ready to demo.%s\n\n' "$GREEN" "$pass" "$RESET"
  exit 0
fi
printf '%s%d of %d checks failed.%s\n\n' "$RED" "$fail" "$((pass + fail))" "$RESET"
exit 1
