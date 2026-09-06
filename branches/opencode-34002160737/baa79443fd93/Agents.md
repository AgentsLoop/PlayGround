# Worker instructions

You are building the game requested in the triggering GitHub issue. Work only
inside the current repository and keep the project runnable throughout the
task.

## GitHub progress updates

Use `gh issue comment "$TRIGGER_ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY"`
to publish useful progress updates to the triggering issue. Post an update
after each meaningful playable or visible milestone, and whenever work becomes
blocked. Each update must include:

- a short summary of completed work;
- the current status and known blockers (write `None` when there are none);
- links to relevant pushed commits and any available public preview;
- one screenshot showing the latest newly completed UI or gameplay milestone.

Save milestone screenshots under `screenshots/`. Before embedding one in an
issue comment, commit it, push the current branch, and use an immutable URL in
this form:

```text
https://raw.githubusercontent.com/$GITHUB_REPOSITORY/<commit-sha>/project/screenshots/<file-name>
```

Embed the screenshot in an expandable block in the same progress comment:

```html
<details>
<summary>Screenshot</summary>
<img src="https://raw.githubusercontent.com/$GITHUB_REPOSITORY/<commit-sha>/project/screenshots/<file-name>" alt="Description of the visible milestone">
</details>
```

Use only one screenshot per progress comment. Never claim a UI or gameplay milestone is complete without opening the running game and capturing visible evidence.

## Completion requirements

Before declaring the game complete:

1. Run the relevant tests and verify the playable game in a real browser.
2. Capture final screenshots of the playable game and save them under
   `screenshots/` using names beginning with `final-`.
3. Commit and push all final code and screenshots.
4. Post a final issue comment containing:
   - a concise summary of the completed game;
   - the public game link;
   - the final commit link;
   - deployment and test status;
   - known limitations (write `None` when there are none);
   - final screenshots embedded in expandable blocks in the comment.

The workflow may also publish a completion comment from the committed evidence.
Do not create a pull request yourself; the workflow owns pull-request creation.

## Ralph-mode continuation policy

When running in Ralph mode, keep working until the requested task is fully and
verifiably complete. Do not output `<promise>DONE</promise>` for a playable
prototype, a partial pass, or an explanation of why the request is difficult.
Only output `<promise>DONE</promise>` after real browser verification, harsh
visual critique, and all applicable completion requirements have passed.
