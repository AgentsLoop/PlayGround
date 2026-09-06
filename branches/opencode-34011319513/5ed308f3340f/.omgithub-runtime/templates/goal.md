## Goal-mode continuation policy

When running in Goal mode, use `[goal:blocked]` only when concrete user input
is required. Do not mark the goal blocked merely because the task is difficult,
large, expensive, or impossible to match perfectly. Continue with the best
achievable implementation until the configured time, token, or turn budget is
exhausted.
