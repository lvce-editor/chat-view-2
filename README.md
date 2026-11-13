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
- Agent context identifies the workspace by its valid absolute URI, preserving
  non-file schemes such as `memfs`.
- Conversations retain their original workspace, with separate tool sessions.
  Edits are applied directly; use Git to review or recover changes.
- Reads include unsaved editor buffers. Edits reject stale contents and serialize
  mutations of the same file across concurrent conversations.
- Drafts, partial responses, and history persist in IndexedDB. Interrupted turns
  require an explicit follow-up; stopping keeps already-applied edits.
- Web search returns clickable sources or identifies OpenAI's native data feed.
  Workspace citations open the referenced file and line.
- A host contract accepts bounded editor context, diagnostics, and a cancellable
  command executor. When present, it runs up to two focused repository checks
  and returns failures to the model for repair.
- On Electron and other Node hosts, the agent can run Bash commands from the
  open workspace. The command tool is omitted entirely on the web platform.
- The backend, tools, persistence, and mock agent are dynamically loaded only
  after the view opens.

The initial UI bundle has a 150 KB uncompressed budget, the agent bundle a
300 KB budget, and the desktop command process a 200 KB budget.
`npm run check:budgets` enforces these after a production build.

## Evaluation

The e2e tests use the visible Chat 2 composer, real agent loop, workspace tools,
and Responses protocol with recorded model responses. They cover AI-native
entry, weather and follow-ups, unsaved-file questions with file links,
implementation, and concurrent conversations. The static runner also checks
cold signed-out startup and conversation/draft restoration after a real reload.

`npm run e2e:headless`, `npm run e2e:static`, and `npm run evaluation` replay
committed recordings. Missing recordings fail without contacting OpenAI,
even with credentials configured. Coding evaluations also run objective checks
against the resulting workspace files. Explicit `npm run e2e:record --
--headless --filter=recorded` and `npm run evaluation:record` can create new
recordings through the LVCE backend. See [evaluation instructions](packages/evaluation/README.md).

## Development

```sh
npm ci
npm run build
npm run check:budgets
npm test
npm run type-check
npm run lint
```

### Follow-up messages

`chat2.followUpBehavior` defaults to `"queue"`. Messages sent while a task is
running appear at the bottom of the conversation with a Queued label and run
in order after the current response finishes. Set it to `"steer"` to cancel the
current task and send the follow-up once cancellation finishes. Reopen the chat
view after changing this setting.

## Board layout

Run **View: Open Board Layout** and choose **Connect Trello**. Sign in to LVCE,
select **Authorize Trello**, then follow **Continue to Trello** to grant read access
in your browser. If prompted, sign in to the same LVCE account as the editor.
The view updates automatically after consent. Enter a board URL
or ID to display its open lists and cards in Trello order, including empty lists.
Refresh to load changes; editing stays in Trello.

The backend must configure a confidential Trello OAuth 2.0 client using
`LVCE_TRELLO_CLIENT_ID` and `LVCE_TRELLO_CLIENT_SECRET`, with callback URL
`https://lvce-editor.dev/auth/trello/callback` (or the configured backend origin
followed by `/auth/trello/callback`). Enable `read:board:trello` in Trello; the
backend also requests `offline_access` for refresh tokens. The client secret and
Trello tokens stay in the backend. The editor uses its LVCE access token and
never forwards it to a different `chat2.backendUrl` override.

Board IDs are remembered in `chat2.connectedBoardIds`. **Forget board** removes
an individual saved board; **Disconnect Trello** removes the backend connection
and pending authorization. You can also revoke access in Trello. Board contents
are cached only in memory across layout changes. After reload, select Trello
and reopen a remembered board without entering credentials again.
