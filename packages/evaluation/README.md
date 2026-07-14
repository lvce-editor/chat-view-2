# Chat 2 evaluation

Run every task against a pinned repository and base commit. Give Chat 2 and the
comparison agent the same prompt, files, time limit, and permission boundary.
Do not repair or reinterpret a prompt during a run.

Record one JSON object per run with:

- `taskId`, `agent`, `repository`, and `baseCommit`;
- `solved`, `testsPassed`, `regressions`, and `interventions`;
- `durationMs`, `firstUsefulActionMs`, `toolCalls`, and `tokens`;
- `peakClientHeapBytes` and a short failure classification.

A release candidate must reach parity with the current Codex baseline on solve
rate and stay within the bundle and memory budgets. “More capable” should only
be claimed after repeated runs show a higher solve rate, not from individual
demos.
