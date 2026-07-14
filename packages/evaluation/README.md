# Chat 2 evaluations

This package is the deterministic foundation for running real coding tasks
through Chat 2. A scenario contains its own workspace fixture, prompt, pinned
model, temperature, timeout, and objective checks.

## Layout

```text
scenarios/<id>/scenario.json  scenario configuration
scenarios/<id>/fixture/       clean workspace copied for every run
cache/<sha256>.json           reviewed model responses, committed for CI replay
results/<id>.json             generated run transcript, not committed
workspaces/<id>/              generated working copy, not committed
```

The cache key covers the complete normalized `/v1/responses` request after the
proxy pins its model snapshot and temperature. This includes tool outputs and
previous response IDs, so a cached multi-step run is replayed only when the
conversation is identical. The proxy never forwards editor authentication.

## Run all scenarios

From the repository root, run:

```sh
npm run evaluation
```

This creates a clean workspace for every scenario, runs the Chat 2 agent loop,
and executes the scenario's objective checks. Exact request matches replay the
committed response cache. Cache misses are sent to OpenAI and saved for future
runs.

Copy `.env.example` to the repository-root `.env` and set `OPENAI_API_KEY` when
recording cache misses. A completely cached run needs no key. When a new
request needs a missing, empty, or invalid key, the command explains how to fix
the repository-root `.env` file instead of silently skipping the scenario.

Inspect new cache files before committing them. They contain complete model
inputs, outputs, and workspace tool results. Only controlled evaluation
fixtures should be recorded.

## Run one scenario manually

The lower-level commands remain available when inspecting an individual run.
Prepare a clean workspace:

```sh
npm run evaluation:prepare -- hello-world-html
```

Start the proxy in another terminal:

```sh
npm run evaluation:proxy -- hello-world-html
```

Open the generated workspace in Lvce Editor, set `chat2.backendUrl` to the URL
printed by the proxy, open Chat 2, and submit the printed prompt. The proxy
forces the scenario's model and temperature, serves the model picker locally,
and writes every AI request/response plus extracted tool calls/results to
`results/<id>.json`.

## Starter scenarios

- `hello-world-html` starts from an empty fixture and asks the agent to create
  an HTML page.
- `fix-node-test` contains an intentionally obvious arithmetic bug and a failing
  Node.js test.
