# Single Markdown Prompt Configuration

Consider consolidating the OpenCode workflow prompts into one Markdown file while keeping each prompt independently addressable.

Use explicit reserved markers instead of Markdown headings as section boundaries:

```md
<!-- PROMPT:build -->
Prompt content, including arbitrary Markdown headings.
<!-- END PROMPT:build -->
```

This allows prompt bodies to contain `#`, `##`, nested headings, code fences, HTML, and XML without confusing the extractor. A small reader helper can extract the content between matching start and end markers, while the workflow continues performing placeholder substitutions such as `@COMMENT_BODY@` and `@APP_URL@`.

Recommended convention:

- Store all prompt bodies in `.github/prompts.md`.
- Reserve `PROMPT:<name>` and `END PROMPT:<name>` comments for extraction boundaries.
- Validate that every required prompt has exactly one matching pair and that no marker is duplicated.
- Preserve the existing prompt text and workflow behavior during migration.
