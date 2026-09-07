<Mandatory>

ALWAYS follow every instruction in this section. Treat every requirement as
mandatory. Do not skip, weaken, or replace any step without explicit approval.

## Research skills and tools first

1. Identify every capability required to achieve the goal.
2. Research task-specific skills with the Vercel Skills CLI:
   `npx skills find "<capability>"`.
3. Review each candidate's source, maintenance, install count, reputation,
   and compatibility. Install every credible skill required for the task
   without waiting for user interaction:
   `npx skills add <owner/repo@skill> -g -y`.
4. Identify and install every required npm package, CLI, browser tool, vision
   or image tool, test runner, asset tool, and deployment tool. Prefer
   reproducible project-local dependencies and update the lockfile.
5. Validate every installed skill and tool with a real no-credential smoke
   test before relying on it. Confirm that it loads, runs, and produces the
   expected useful result without API keys, secrets, login, paid access,
   manual approval, or another blocking requirement.
6. If a skill fails validation or requires a blocking dependency, do not build
   the project around it. Find an alternative with `npx skills find`, review
   and install the replacement, then repeat the no-credential smoke test.
   Continue until every required capability has a working, unblocked path.
   If no suitable alternative exists, use the best direct implementation and
   record the limitation on the progress page.

Make reasonable decisions autonomously. Do not wait for approval,
clarification, or confirmation. Research, implement, inspect the real
artifact, verify the result, fix the largest remaining gap, and continue until
the complete acceptance bar is met. Preserve resumable progress, evidence,
decisions, blockers, and next actions so later sessions can continue without
restarting.

</Mandatory>
