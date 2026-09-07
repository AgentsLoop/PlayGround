#!/usr/bin/env bash
set -euo pipefail

started_at="$(date +%s)"

format_elapsed() {
  local elapsed_seconds="$1"
  local elapsed_hours=$((elapsed_seconds / 3600))
  local elapsed_minutes=$(((elapsed_seconds % 3600) / 60))

  if (( elapsed_hours > 0 )); then
    printf '%dh %02dm' "$elapsed_hours" "$elapsed_minutes"
  else
    printf '%dm' "$elapsed_minutes"
  fi
}

if [[ "${1:-}" == "--format-elapsed" ]]; then
  format_elapsed "${2:?elapsed seconds are required}"
  printf '\n'
  exit 0
fi

vision_calls() {
  jq -r '
    def has_image($message):
      any((($message.parts // [])[]?);
        (.type == "file" and ((.mime // .mediaType // "") | startswith("image/"))) or
        (.type == "tool" and any(((.state.attachments // [])[]?.mime?); ((. // "") | startswith("image/"))))
      );
    reduce .[] as $message ({ seen: false, calls: 0 };
      if $message.info.role == "assistant" then
        .calls += (if .seen then 1 else 0 end)
        | .seen = (.seen or has_image($message))
      else
        .seen = (.seen or has_image($message))
      end
    ) | .calls
  '
}

while :; do
  payload="$(curl --fail --silent --show-error \
    -H "x-opencode-directory: $PROJECT_DIR" \
    "http://127.0.0.1:$OPENCODE_WEB_PORT/session/$SESSION_ID/message" 2>/dev/null || true)"
  sessions_payload="$(curl --fail --silent --show-error \
    -H "x-opencode-directory: $PROJECT_DIR" \
    "http://127.0.0.1:$OPENCODE_WEB_PORT/session" 2>/dev/null || true)"
  status_payload="$(curl --fail --silent --show-error \
    -H "x-opencode-directory: $PROJECT_DIR" \
    "http://127.0.0.1:$OPENCODE_WEB_PORT/session/status" 2>/dev/null || true)"
  if jq -e 'type == "array"' >/dev/null 2>&1 <<<"$payload" && \
    jq -e 'type == "array"' >/dev/null 2>&1 <<<"$sessions_payload" && \
    jq -e 'type == "object"' >/dev/null 2>&1 <<<"$status_payload"; then
    stats="$(jq -r '
      def parts: [.[].parts[]?];
      def tools: [parts[] | select(.type == "tool")];
      [
        (tools | length),
        ([tools[] | select(.state.status == "running" or .state.status == "pending")] | length)
      ] | @tsv
    ' <<<"$payload")"
    IFS=$'\t' read -r tool_count active_count <<<"$stats"
    subagent_stats="$(jq -nr \
      --arg root "$SESSION_ID" \
      --argjson sessions "$sessions_payload" \
      --argjson statuses "$status_payload" '
      def descendants($all; $parent):
        [$all[] | select(.parentID == $parent)] as $children
        | ($children | map(.id)) as $ids
        | if ($ids | length) == 0 then $ids
          else $ids + ([$ids[] | descendants($all; .)] | add)
          end;
      ($sessions | descendants($sessions; $root)) as $subagents
      | {
          total: ($subagents | length),
          failed: ([$statuses | to_entries[]
            | select((.key as $id | ($subagents | index($id))) != null)
            | select(.value.type == "error" or .value.type == "failed")
          ] | length),
          active: ([$statuses | to_entries[]
            | select((.key as $id | ($subagents | index($id))) != null)
            | select(.value.type != "idle" and .value.type != "error" and .value.type != "failed")
          ] | length)
        }
      | [.active, .total, .failed] | @tsv
    ')"
    IFS=$'\t' read -r active_subagents total_subagents failed_subagents <<<"$subagent_stats"
    token_count="$(jq -nr \
      --arg root "$SESSION_ID" \
      --argjson sessions "$sessions_payload" '
      def descendants($all; $parent):
        [$all[] | select(.parentID == $parent)] as $children
        | ($children | map(.id)) as $ids
        | if ($ids | length) == 0 then $ids
          else $ids + ([$ids[] | descendants($all; .)] | add)
          end;
      ([$root] + ($sessions | descendants($sessions; $root))) as $tracked
      | reduce $sessions[] as $session (0;
          if ($tracked | index($session.id)) == null then .
          else .
            + ($session.tokens.input // 0)
            + ($session.tokens.output // 0)
            + ($session.tokens.reasoning // 0)
            + ($session.tokens.cache.read // 0)
            + ($session.tokens.cache.write // 0)
          end
        )
    ')"
    subagent_ids="$(jq -nr \
      --arg root "$SESSION_ID" \
      --argjson sessions "$sessions_payload" '
      def descendants($all; $parent):
        [$all[] | select(.parentID == $parent)] as $children
        | ($children | map(.id)) as $ids
        | if ($ids | length) == 0 then $ids
          else $ids + ([$ids[] | descendants($all; .)] | add)
          end;
      ($sessions | descendants($sessions; $root))[]
    ')"
    vision_count="$(vision_calls <<<"$payload")"
    while IFS= read -r subagent_id; do
      [[ -n "$subagent_id" ]] || continue
      subagent_payload="$(curl --fail --silent --show-error \
        -H "x-opencode-directory: $PROJECT_DIR" \
        "http://127.0.0.1:$OPENCODE_WEB_PORT/session/$subagent_id/message" 2>/dev/null || true)"
      if jq -e 'type == "array"' >/dev/null 2>&1 <<<"$subagent_payload"; then
        subagent_vision_count="$(vision_calls <<<"$subagent_payload")"
        vision_count=$((vision_count + subagent_vision_count))
      fi
    done <<<"$subagent_ids"
    changed_count="$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    elapsed_seconds="$(( $(date +%s) - started_at ))"
    elapsed="$(format_elapsed "$elapsed_seconds")"
    speed_score="$(awk -v tokens="$token_count" -v elapsed="$elapsed_seconds" \
      'BEGIN { if (elapsed > 0) printf "%.1f", tokens / elapsed; else print "0.0" }')"
    access_links="$(< "${PROGRESS_COMMENT_TEMPLATE:-$(dirname "$0")/opencode-progress-comment-template.md}")"
    ssh_section=""
    if [[ "${AGENTSWEB_SSH_ENABLED:-false}" == "true" && "${AGENTSWEB_SSH_READY:-false}" == "true" ]]; then
      ssh_section="🔐 **Temporary AgentsWeb SSH session is ready.**

Run: ${RUN_URL}
Host: ${SSH_HOST}:${SSH_PORT}

Run this command while the job is active:

Command:
${SSH_COMMAND}
"
    fi
    progress_stats="- Elapsed: ${elapsed}
- Token count: ${token_count}
- Speed score: ${speed_score} tokens/s
- Tool calls: $tool_count
- Active tool calls: $active_count
- Active subagents: $active_subagents
- Total subagents executed: $total_subagents
- Total failed subagents: $failed_subagents
- Image-context model calls: $vision_count
- Changed workspace files: $changed_count"
    validation_session_section=""
    if [[ -s "$OPENCODE_WEB_DIR/validation-session-url" ]]; then
      validation_session_section="🔎 **Validation OpenCode Web UI:** $(<"$OPENCODE_WEB_DIR/validation-session-url")"
    fi
    access_note="This opens the currently running OpenCode session directly. Access remains available while OpenCode runs and for 5 hours afterwards."
    access_links="${access_links//@SSH_SECTION@/$ssh_section}"
    access_links="${access_links//@UPDATED@/$(date -u '+%Y-%m-%d %H:%M:%S UTC')}"
    access_links="${access_links//@OPENCODE_WEB_URL@/$OPENCODE_WEB_URL}"
    access_links="${access_links//@PROJECT_FILE_URL@/${PROJECT_FILE_URL:-unavailable}}"
    access_links="${access_links//@VALIDATION_SESSION_SECTION@/$validation_session_section}"
    access_links="${access_links//@PROGRESS_STATS@/$progress_stats}"
    access_links="${access_links//@ACCESS_NOTE@/$access_note}"
    body="${access_links}

_Image-context model calls are inferred from image attachments in the session transcript. Message contents and tool details are hidden. Full logs are published in the completion release._"
    if [[ "${PROGRESS_DRY_RUN:-false}" == "true" ]]; then
      printf '%s\n' "$body" > "${PROGRESS_OUTPUT:?PROGRESS_OUTPUT is required in dry-run mode}"
    else
      gh api --method PATCH "repos/$REPOSITORY/issues/comments/$COMMENT_ID" \
        -f body="$body" >/dev/null || true
    fi
  fi
  [[ -f "$OPENCODE_WEB_DIR/response-comment.done" ]] && break
  sleep 10
done
