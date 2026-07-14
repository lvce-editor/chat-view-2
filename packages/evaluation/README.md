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

## Record or replay a scenario

Copy `.env.example` to the repository-root `.env` and set `OPENAI_API_KEY` only
when recording a cache miss. Replaying a completely cached scenario needs no
key; an uncached request fails instead of silently spending money.

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

Inspect cache files before committing them. They contain complete model inputs,
outputs, and workspace tool results. Only controlled evaluation fixtures should
be recorded.

## Starter scenarios

- `hello-world-html` starts from an empty fixture and asks the agent to create
  an HTML page.
- `fix-node-test` contains an intentionally obvious arithmetic bug and a failing
  Node.js test.

The next layer can automate the manual editor steps and execute each scenario's
checks. Because the fixtures, request cache, and transcript schema already have
stable boundaries, that runner can use the same data locally and in PR CI.
