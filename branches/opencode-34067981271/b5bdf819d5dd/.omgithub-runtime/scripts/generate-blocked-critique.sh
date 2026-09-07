#!/usr/bin/env bash
set -euo pipefail

: "${CRITIQUE_TEMPLATE:?CRITIQUE_TEMPLATE is required}"
: "${BLOCKED_CONTEXT_FILE:?BLOCKED_CONTEXT_FILE is required}"
: "${ORIGINAL_REQUEST:?ORIGINAL_REQUEST is required}"
: "${OUTPUT_FILE:?OUTPUT_FILE is required}"
: "${OPENCODE_SESSION_ID:?OPENCODE_SESSION_ID is required}"

ZEN_URL="${OPENCODE_ZEN_URL:-https://opencode.ai/zen/v1}"
MODEL_PREFERENCE="${OPENCODE_ZEN_MODEL:-muse-spark-1.3-contributor-free}"
REQUEST_ID="req_blocked_$(date +%s)_$$"
capture_file="${OPENCODE_CAPTURE_FILE:-${OUTPUT_FILE}.request.json}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/opencode-zen-blocked.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

models_file="$work_dir/models.json"
response_file="$work_dir/response.json"

curl --fail --silent --show-error --max-time 30 \
  -H 'Authorization: Bearer public' \
  -H 'User-Agent: opencode/1.4.3' \
  -H 'X-Opencode-Client: cli' \
  -H 'X-Opencode-Project: global' \
  -H "X-Opencode-Session: $OPENCODE_SESSION_ID" \
  -H "X-Opencode-Request: $REQUEST_ID" \
  "$ZEN_URL/models" > "$models_file"

model="$(jq -r --arg preferred "$MODEL_PREFERENCE" '
  [.data[]?.id // empty] as $ids
  | if ($ids | index($preferred)) then $preferred
    else ($ids | map(select(endswith("-free"))) | .[0] // empty)
    end
' "$models_file")"
if [[ -z "$model" ]]; then
  echo 'OpenCode Zen returned no usable free model.' >&2
  exit 1
fi

template="$(< "$CRITIQUE_TEMPLATE")"
blocked_context="$(< "$BLOCKED_CONTEXT_FILE")"
prompt="${template//@REQUEST@/$ORIGINAL_REQUEST}"
prompt="${prompt//@BLOCKED_CONTEXT@/$blocked_context}"

request_body="$work_dir/request.json"
jq -n \
  --arg model "$model" \
  --arg prompt "$prompt" \
  '{model: $model, input: [{role: "user", content: [{type: "input_text", text: $prompt}]}], stream: false, store: false}' \
  > "$request_body"

jq --argjson body "$(< "$request_body")" \
  --arg model "$model" \
  --arg session "$OPENCODE_SESSION_ID" \
  --arg request "$REQUEST_ID" \
  '{model: $model, session: $session, request: $request, body: $body}' \
  > "$capture_file"

http_code="$(curl --silent --show-error --max-time 180 \
  -o "$response_file" \
  -w '%{http_code}' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer public' \
  -H 'User-Agent: opencode/1.4.3' \
  -H 'X-Opencode-Client: cli' \
  -H 'X-Opencode-Project: global' \
  -H "X-Opencode-Session: $OPENCODE_SESSION_ID" \
  -H "X-Opencode-Request: $REQUEST_ID" \
  --data-binary "@$request_body" \
  "$ZEN_URL/responses")"

if [[ ! "$http_code" =~ ^2 ]]; then
  echo "OpenCode Zen returned HTTP $http_code:" >&2
  sed -n '1,120p' "$response_file" >&2
  exit 1
fi

generated="$(jq -r '
  if (.output_text? | type) == "string" then .output_text
  else ([.output[]?.content[]? | select(.type == "output_text") | .text] | join("\n\n"))
  end
' "$response_file")"
if [[ -z "${generated//[[:space:]]/}" ]]; then
  echo 'OpenCode Zen returned an empty continuation prompt.' >&2
  sed -n '1,120p' "$response_file" >&2
  exit 1
fi

printf '%s\n' "$generated" > "$OUTPUT_FILE"
printf 'model=%s\nrequest_id=%s\noutput=%s\n' "$model" "$REQUEST_ID" "$OUTPUT_FILE"
