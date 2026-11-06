# Chat 2 evaluations

This package runs real coding tasks through the complete Chat 2 browser stack.
A scenario contains its own workspace fixture, prompt, pinned model, timeout,
objective checks, and an optional temperature.

## Layout

```text
scenarios/<id>/scenario.json  scenario configuration
scenarios/<id>/fixture/       clean workspace copied for every run
cache/<sha256>.json           reviewed model responses, committed for CI replay
results/<id>.json             generated run transcript, not committed
workspaces/<id>/              generated working copy, not committed
```

The cache key covers the complete normalized Responses request, including
previous response IDs and tool results. Workspace roots are normalized so a
recording can replay on another machine without ignoring meaningful inputs.
Production WebSocket events are recorded and replayed using the same protocol
as chat. Fixtures contain controlled data; review new recordings before committing.

## Repeat tests without provider cost

From the repository root:

```sh
npm run e2e:headless
npm run evaluation
npm run build:static
npm run e2e:static
# Official packaged desktop app, with an isolated temporary profile:
npm run e2e:headless -- --electron --filter=recorded

# Verify the extension bundled in a released app, without linking local source:
npm run e2e:headless -- --electron --builtin --electron-version=<tag> --filter=recorded
```

The tests type into the visible Chat 2 composer and assert rendered output and
workspace changes. Coding evaluations use clean filesystem fixtures and run
objective checks afterward. Normal commands always replay. A cache miss fails;
the proxy never contacts the provider in replay mode, even with credentials.
CI runs these commands without an OpenAI key or LVCE token.

## Record new requests explicitly

Copy `.env.example` to the repository-root `.env`, set `LVCE_ACCESS_TOKEN` to an
access token for the LVCE backend, and set `EVALUATION_UPSTREAM_URL` to its API
root, for example `https://your-lvce-backend.example/api/v1`. The backend keeps
the OpenAI credential. Then run the relevant explicit recording command:

```sh
npm run evaluation:record
npm run e2e:record -- --headless --filter=recorded
npm run e2e:static:record
npm run e2e:record -- --headless --electron --filter=recorded
```

Recording commands load the local `.env` file. Only missing requests are
recorded; matching requests replay. Recording can incur provider cost.
Inspect the generated transcript in `results/` and commit only recordings
needed for the accepted scenarios. Neither tokens nor HTTP authorization
headers are stored in recordings. For static recording, build the static site first. On Linux without a display,
run Electron commands under `xvfb-run -a`. New prompts, tools, or tool outputs require
new recordings; CI never updates them automatically.

## Run one scenario manually

The lower-level commands remain available when inspecting an individual run
visually.
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
forces the scenario's model and any configured temperature, serves the model
picker locally, and writes every AI request/response plus extracted tool
calls/results to `results/<id>.json`.

## Starter scenarios

- `hello-world-html` starts from an empty fixture and asks the agent to create
  an HTML page.
- `fix-node-test` contains an intentionally obvious arithmetic bug and a failing
  Node.js test.
