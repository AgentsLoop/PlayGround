# Issue-triggered OpenCode workflow

## Idea

Remove workflow dispatch responsibility from the GitHub App. Use the issue
label event as the OpenCode execution trigger instead.

## Proposed flow

1. The App creates an issue without execution labels.
2. The App validates the request and adds the exact `OpenCode` label.
3. A GitHub Actions workflow listens only to `issues.labeled`.
4. The workflow starts only when `github.event.label.name == 'OpenCode'`.
5. The workflow passes the issue number and labels to the existing reusable
   OpenCode workflow, which retrieves the issue body and performs the run.

## Trigger shape

```yaml
name: OpenCode issue

on:
  issues:
    types: [labeled]

concurrency:
  group: opencode-issue-${{ github.repository }}-${{ github.event.issue.number }}
  cancel-in-progress: false

jobs:
  opencode:
    if: >
      github.event.issue.pull_request == null &&
      github.event.label.name == 'OpenCode'
    uses: ./.github/workflows/opencode-reusable.yml
    with:
      issue_number: ${{ github.event.issue.number }}
      labels_json: ${{ toJSON(github.event.issue.labels) }}
    secrets: inherit
```

## Benefits

- GitHub owns event delivery and workflow retries.
- The App no longer needs Actions dispatch permission or dispatch-specific API
  logic.
- The exact `OpenCode` label remains the explicit execution gate.
- Status labels such as `in progress`, `complete`, and `failed` do not retrigger
  the workflow.
- A per-issue concurrency group prevents overlapping executions.

## Security and migration notes

- Keep the App as the authorization and validation gate for applying
  `OpenCode`; do not allow arbitrary issue authors to self-trigger privileged
  runs in a public repository.
- Create the issue first and apply `OpenCode` afterward. This avoids duplicate
  execution paths that can occur when handling both `opened` and `labeled`.
- Treat issue title and body content as untrusted input when passing it to
  OpenCode.
- Keep the current reusable workflow responsible for checkout, tunnels,
  validation, PR creation, and issue status updates.
- Remove the App's `workflow_dispatch` call and its related dispatch error
  handling only after the new issue-trigger workflow has been tested end to
  end.
