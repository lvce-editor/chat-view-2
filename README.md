# Chat 2

A focused, low-overhead coding agent for Lvce Editor.

Chat 2 keeps the visible product small: tasks, useful messages, an OpenAI model
picker, current activity, changed files, and a composer. Its multi-step agent
loop runs in the client while authenticated model requests are streamed through
the configured Lvce Responses API.

## Backend

Set `chat2.backendUrl` to an authenticated Lvce backend that provides:

- `GET /v1/models`, returning `data` or `models` with OpenAI model IDs, labels,
  availability, and plan eligibility;
- `POST /v1/responses`, proxying the OpenAI Responses streaming protocol while
  enforcing authentication, model access, usage accounting, and billing.

When the setting is empty, Chat 2 uses its deterministic mock agent. This keeps
local development and end-to-end tests independent of production credentials.
Authentication is expected to use the editor's existing backend session; Chat 2
does not store API keys in its task database.

## Agent architecture

- Task history is an append-only event log persisted in IndexedDB.
- The Responses client handles streamed messages and multi-step function calls.
- Independent read tools run in parallel; mutations remain serialized.
- Workspace searches and reads are bounded. Atomic edits use exact text and an
  optional content hash to reject stale changes.
- Each active turn snapshots files before the first edit and can revert them.
- A portable host contract accepts bounded editor context, diagnostics, and a
  cancellable command sandbox on both desktop and web. When present, it runs up
  to two focused repository checks and returns failures to the model for repair.
- Command execution is removed from the model's tool catalog until Lvce provides
  that enforced workspace sandbox. Chat 2 never falls back to an unrestricted
  host shell.
- The backend, tools, persistence, and mock agent are dynamically loaded only
  after the view opens.

The initial UI bundle has a 150 KB uncompressed budget and total JavaScript has
a 300 KB budget. `npm run check:budgets` enforces both after a production build.

## Evaluation

The versioned task set in `evaluation/v1/tasks.json` is the release-quality
baseline. Each task should be run from the same base commit in Chat 2 and Codex.
Record solve status, tests, interventions, duration, token use, and peak client
memory using the schema described in `evaluation/README.md`.

## Development

```sh
npm ci
npm run build
npm run check:budgets
npm test
npm run type-check
npm run lint
```
