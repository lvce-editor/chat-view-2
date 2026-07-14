# Chat 2

A focused, low-overhead coding agent for Lvce Editor.

Chat 2 keeps the visible product small: tasks, useful messages, an OpenAI model
picker, current activity, changed files, and a composer. Its multi-step agent
loop runs in the client while authenticated model requests are streamed through
the configured Lvce Responses API.

## Backend

By default, Chat 2 uses the editor's configured backend and current
authentication. The backend provides:

- `GET /v1/models`, returning `data` or `models` with OpenAI model IDs, labels,
  availability, and plan eligibility;
- `POST /v1/responses`, proxying the OpenAI Responses streaming protocol while
  enforcing authentication, model access, usage accounting, and billing.

Set `chat2.backendUrl` only to override the editor backend. The editor token is
never sent to a different override URL. Set `chat2.useMockBackend` to `true` to
use the deterministic mock agent for local development or tests. Chat 2 does
not store API keys in its task database.

## Agent architecture

- Task history is an append-only event log persisted in IndexedDB.
- The Responses client handles streamed messages and multi-step function calls.
- Independent read tools run in parallel; mutations remain serialized.
- Workspace searches and reads are bounded. Atomic edits use exact text and an
  optional content hash to reject stale changes.
- Agent context identifies the workspace as `.` so tool paths and evaluation
  cache keys remain portable across machines.
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

The scenario fixtures, headless browser runner, and deterministic recording
proxy live in `packages/evaluation`. Evaluations invoke the extension's
headless session commands inside Lvce Editor, exercising the real agent loop,
API client, tools, editor file-system APIs, and test server without rendering
the chat UI. Cached model responses can be replayed in CI without an API key or
another paid request. Run every scenario and its objective checks with
`npm run evaluation`. See `packages/evaluation/README.md` for the scenario
format and cache-recording details.

## Development

```sh
npm ci
npm run build
npm run check:budgets
npm test
npm run type-check
npm run lint
```
