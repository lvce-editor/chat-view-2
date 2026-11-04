/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types, sonarjs/cognitive-complexity, sonarjs/no-nested-conditional */
import type {
  AgentToolCall,
  AgentToolHost,
  AgentToolResult,
} from '@lvce-editor/chat-tool-worker/parts/AgentToolHost/AgentToolHost.ts'
import type { AgentBackend, AgentInput } from '../AgentBackend/AgentBackend.ts'
import type {
  ChatApi,
  ChatChangedFile,
  ChatRunOptions,
  ChatTask,
  ChatTaskEvent,
  ChatTraceMessage,
} from '../ChatApi/ChatApi.ts'
import type { TaskStore } from '../TaskStore/TaskStore.ts'
import { appendEvent, createEvent, setStatus } from '../ChatTask/ChatTask.ts'
import {
  isTaskExecuting,
  tryWithTaskExecution,
  withTaskExecution,
} from '../TaskExecution/TaskExecution.ts'

export interface AgentChatApiOptions {
  readonly backend: AgentBackend
  readonly createToolHost?: (task: ChatTask) => Promise<AgentToolHost>
  readonly maxSteps?: number
  readonly store: TaskStore
  readonly titleModelId?: string
  readonly toolHost?: AgentToolHost
  readonly workspaceUriProvider?: () => Promise<string>
}

const readOnlyTools = new Set([
  'get_diagnostics',
  'get_workspace_uri',
  'read_file',
  'search_workspace',
])
const titleWhitespacePattern = /\s+/g
const titleCasedLetterPattern = /\p{Cased_Letter}/u
const capitalizeTitle = (title: string): string =>
  title.replace(titleCasedLetterPattern, (letter) => letter.toUpperCase())
const quotedTitlePattern = /^(["'])(.*)\1$/

const getTitle = (message: string): string => {
  const firstLine = message.split('\n', 1)[0]?.trim() || 'New task'
  const capitalizedFirstLine = capitalizeTitle(firstLine)
  return capitalizedFirstLine.length > 60
    ? `${capitalizedFirstLine.slice(0, 57)}...`
    : capitalizedFirstLine
}

const notify = async (
  task: ChatTask,
  options?: ChatRunOptions,
  store?: TaskStore,
): Promise<void> => {
  const current = store ? await store.get(task.id) : undefined
  const latestTask = current
    ? {
        ...current,
        ...(task.streamingText !== undefined && {
          streamingText: task.streamingText,
        }),
      }
    : task
  await options?.onUpdate?.(latestTask)
}

const withStoredTitle = (task: ChatTask, current?: ChatTask): ChatTask =>
  current?.titleGenerated
    ? { ...task, title: current.title, titleGenerated: true }
    : task

const trace = async (
  message: ChatTraceMessage,
  options?: ChatRunOptions,
): Promise<void> => {
  await options?.onTrace?.(message)
}

const parseToolArguments = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const isAbortError = (error: unknown): boolean => {
  return error instanceof DOMException && error.name === 'AbortError'
}

const withEvent = async (
  task: ChatTask,
  event: ChatTaskEvent,
  store: TaskStore,
  options?: ChatRunOptions,
): Promise<ChatTask> => {
  const updated = appendEvent(task, event)
  await store.save(updated)
  await notify(updated, options, store)
  return updated
}

const getActivityLabel = (call: AgentToolCall): string => {
  switch (call.name) {
    case 'apply_patch':
      return 'Editing workspace'
    case 'execute_typescript':
      return 'Executing TypeScript'
    case 'get_diagnostics':
      return 'Checking diagnostics'
    case 'get_workspace_uri':
      return 'Getting workspace URI'
    case 'read_file':
      return 'Reading files'
    case 'run_command':
      return 'Running verification'
    case 'search_workspace':
      return 'Searching workspace'
    default:
      return `Using ${call.name}`
  }
}

const executeCalls = async (
  calls: readonly AgentToolCall[],
  toolHost: AgentToolHost,
  signal?: AbortSignal,
): Promise<readonly AgentToolResult[]> => {
  const results: AgentToolResult[] = Array.from({ length: calls.length })
  const reads = calls
    .map((call, index) => ({ call, index }))
    .filter(({ call }) => readOnlyTools.has(call.name))
  await Promise.all(
    reads.map(async ({ call, index }) => {
      results[index] = await toolHost.execute(call, signal)
    }),
  )
  for (let index = 0; index < calls.length; index++) {
    if (!readOnlyTools.has(calls[index]?.name || '')) {
      results[index] = await toolHost.execute(calls[index], signal)
    }
  }
  return results
}

const steering = new Map<
  string,
  {
    readonly attachments?: ChatRunOptions['attachments']
    readonly text: string
  }[]
>()

export const createAgentChatApi = ({
  backend,
  createToolHost,
  maxSteps = 30,
  store,
  titleModelId,
  toolHost: providedToolHost,
  workspaceUriProvider,
}: AgentChatApiOptions): ChatApi => {
  const run = async (
    initialTask: ChatTask,
    message: string,
    options?: ChatRunOptions,
    appendMessage = false,
  ): Promise<ChatTask> =>
    withTaskExecution(initialTask.id, async () => {
      const stored = appendMessage ? await store.get(initialTask.id) : undefined
      let task = stored
        ? { ...stored, modelId: initialTask.modelId }
        : initialTask
      if (task.workspaceUri === undefined && workspaceUriProvider) {
        task = { ...task, workspaceUri: await workspaceUriProvider() }
      }
      if (appendMessage) {
        task = appendEvent(
          task,
          createEvent({
            ...(options?.attachments && { attachments: options.attachments }),
            text: message,
            type: 'user-message',
          }),
        )
      }
      const restartInterrupted = ['interrupted', 'stopped', 'failed'].includes(
        task.status,
      )
      if (restartInterrupted) {
        const {
          responseHistory: _responseHistory,
          responseId: _responseId,
          ...rest
        } = task
        task = rest
      }
      const conversationContext = restartInterrupted
        ? `Previous conversation (the last turn did not finish; inspect current files before continuing):\n${task.events
            .filter(
              (event) =>
                event.type === 'user-message' ||
                event.type === 'assistant-message',
            )
            .map((event) =>
              JSON.stringify({ role: event.type, text: event.text }),
            )
            .join('\n')}\n\n`
        : ''
      task = setStatus(task, 'running')
      let turnHost: AgentToolHost | undefined
      let streamedText = ''
      try {
        const toolHost = createToolHost
          ? await createToolHost(task)
          : providedToolHost
        if (!toolHost) {
          throw new Error('Chat workspace tools are unavailable')
        }
        turnHost = toolHost
        await trace(
          {
            content: message,
            role: 'user',
            timestamp: Date.now(),
          },
          options,
        )
        await toolHost.beginTurn(task.id)
        await store.save(task)
        await notify(task, options, store)
        let input: readonly AgentInput[] = [
          {
            content: `${await toolHost.getWorkspaceContext()}\n\n${conversationContext}User task:\n${message}`,
            ...(options?.attachments && { attachments: options.attachments }),
            role: 'user',
          },
        ]
        let previousResponseId = task.responseId
        let lastStreamRender = 0
        for (let step = 0; step < maxSteps; step++) {
          options?.signal?.throwIfAborted()
          const queued = steering.get(task.id) || []
          steering.delete(task.id)
          if (queued.length > 0) {
            for (const steeringMessage of queued) {
              task = await withEvent(
                task,
                createEvent({
                  ...(steeringMessage.attachments && {
                    attachments: steeringMessage.attachments,
                  }),
                  text: steeringMessage.text,
                  type: 'user-message',
                }),
                store,
                options,
              )
            }
            input = [
              ...input,
              ...queued.map((steeringMessage) => ({
                content: `User steering update:\n${steeringMessage.text}`,
                ...(steeringMessage.attachments && {
                  attachments: steeringMessage.attachments,
                }),
                role: 'user' as const,
              })),
            ]
          }
          const result = await backend.runStep({
            input,
            ...(task.responseHistory && {
              responseHistory: task.responseHistory,
            }),
            modelId: task.modelId,
            onTextDelta: async (delta) => {
              streamedText += delta
              const now = performance.now()
              if (now - lastStreamRender >= 50) {
                task = { ...task, streamingText: streamedText }
                await store.save(task)
                lastStreamRender = now
                await notify(task, options, store)
              }
            },
            ...(previousResponseId && { previousResponseId }),
            ...(options?.signal && { signal: options.signal }),
            tools: await toolHost.getDefinitions(),
          })
          await trace(
            {
              content: [
                ...(result.text
                  ? [{ text: result.text, type: 'text' as const }]
                  : []),
                ...result.toolCalls.map((call) => ({
                  arguments: parseToolArguments(call.arguments),
                  id: call.callId,
                  name: call.name,
                  type: 'toolCall' as const,
                })),
              ],
              model: task.modelId,
              responseId: result.responseId,
              role: 'assistant',
              timestamp: Date.now(),
            },
            options,
          )
          previousResponseId = result.responseId || previousResponseId
          const { streamingText: _streamingText, ...taskWithoutStreamingText } =
            task
          task = {
            ...taskWithoutStreamingText,
            ...(result.responseHistory && {
              responseHistory: result.responseHistory,
            }),
            ...(previousResponseId && { responseId: previousResponseId }),
          }
          streamedText = ''
          const lateSteering = steering.get(task.id) || []
          if (result.toolCalls.length === 0 && lateSteering.length > 0) {
            steering.delete(task.id)
            for (const steeringMessage of lateSteering) {
              task = await withEvent(
                task,
                createEvent({
                  ...(steeringMessage.attachments && {
                    attachments: steeringMessage.attachments,
                  }),
                  text: steeringMessage.text,
                  type: 'user-message',
                }),
                store,
                options,
              )
            }
            input = lateSteering.map((steeringMessage) => ({
              content: `User steering update:\n${steeringMessage.text}`,
              ...(steeringMessage.attachments && {
                attachments: steeringMessage.attachments,
              }),
              role: 'user' as const,
            }))
            continue
          }
          if (result.toolCalls.length === 0) {
            const files = await toolHost.getChangedFiles()
            let checksPassed = 0
            if (files.length > 0 && toolHost.verifyChanges) {
              task = await withEvent(
                task,
                createEvent({
                  label: 'Running focused verification',
                  status: 'running',
                  type: 'activity',
                }),
                store,
                options,
              )
              const verification = await toolHost.verifyChanges(options?.signal)
              await trace(
                {
                  content: verification.output,
                  customType: 'verification',
                  isError: verification.failed,
                  role: 'custom',
                  timestamp: Date.now(),
                },
                options,
              )
              task = await withEvent(
                task,
                createEvent({
                  detail: verification.output,
                  label: 'Running focused verification',
                  status: verification.failed ? 'failed' : 'completed',
                  type: 'activity',
                }),
                store,
                options,
              )
              if (verification.failed) {
                input = [
                  {
                    content: `Automatic verification failed. Repair the changes and run verification again.\n\n${verification.output}`,
                    role: 'user',
                  },
                ]
                continue
              }
              const { checksPassed: passedChecks } = verification
              checksPassed = passedChecks
            }
            if (result.text) {
              task = await withEvent(
                task,
                createEvent({ text: result.text, type: 'assistant-message' }),
                store,
                options,
              )
            }
            task = setStatus(task, 'completed')
            if (files.length > 0) {
              task = appendEvent(
                task,
                createEvent({ checksPassed, files, type: 'changes' }),
              )
            }
            await store.save(task)
            await notify(task, options, store)
            return task
          }
          if (result.text) {
            task = await withEvent(
              task,
              createEvent({ text: result.text, type: 'assistant-message' }),
              store,
              options,
            )
          }
          const activities = result.toolCalls.map((call) =>
            createEvent({
              detail: call.name,
              label: getActivityLabel(call),
              status: 'running',
              type: 'activity',
            }),
          )
          for (const activity of activities) {
            task = appendEvent(task, activity)
          }
          await store.save(task)
          await notify(task, options, store)
          const outputs = await executeCalls(
            result.toolCalls,
            toolHost,
            options?.signal,
          )
          for (let index = 0; index < result.toolCalls.length; index++) {
            const call = result.toolCalls[index]
            const output = outputs[index]
            await trace(
              {
                content: [{ text: output.content, type: 'text' }],
                isError: output.isError,
                role: 'toolResult',
                timestamp: Date.now(),
                toolCallId: call.callId,
                toolName: call.name,
              },
              options,
            )
          }
          for (let index = 0; index < activities.length; index++) {
            const activity = activities[index]
            const output = outputs[index]
            task = appendEvent(
              task,
              createEvent({
                ...(output.isError
                  ? { detail: output.content }
                  : activity.detail
                    ? { detail: activity.detail }
                    : {}),
                label: activity.label,
                status: output.isError ? 'failed' : 'completed',
                type: 'activity',
              }),
            )
          }
          const changedFiles = await toolHost.getChangedFiles()
          if (changedFiles.length > 0) {
            task = appendEvent(
              task,
              createEvent({
                checksPassed: 0,
                files: changedFiles,
                type: 'changes',
              }),
            )
          }
          input = result.toolCalls.map((call, index) => ({
            callId: call.callId,
            output: outputs[index].modelOutput || outputs[index].content,
            type: 'function-call-output' as const,
          }))
          await store.save(task)
          await notify(task, options, store)
        }
        throw new Error(`Agent stopped after ${maxSteps} steps`)
      } catch (error) {
        const { streamingText: _partial, ...withoutStreaming } = task
        task = withoutStreaming
        if (streamedText) {
          task = appendEvent(
            task,
            createEvent({ text: streamedText, type: 'assistant-message' }),
          )
        }
        if (turnHost) {
          // A lost tool worker must not prevent saving the interrupted/failed turn.
          let files: readonly ChatChangedFile[] = []
          try {
            files = await turnHost.getChangedFiles()
          } catch {
            /* Keep previously persisted changes. */
          }
          if (files.length > 0) {
            task = appendEvent(
              task,
              createEvent({ checksPassed: 0, files, type: 'changes' }),
            )
          }
        }
        if (isAbortError(error) || options?.signal?.aborted) {
          task = await withEvent(
            task,
            createEvent({ text: 'Stopped.', type: 'assistant-message' }),
            store,
            options,
          )
          task = setStatus(task, 'stopped')
        } else {
          task = appendEvent(
            task,
            createEvent({
              message: error instanceof Error ? error.message : String(error),
              type: 'error',
            }),
          )
          task = setStatus(task, 'failed')
        }
        await store.save(task)
        await notify(task, options, store)
        return task
      } finally {
        steering.delete(task.id)
        if (createToolHost) {
          await turnHost?.dispose?.()
        }
      }
    })

  const recoverTask = async (
    task: ChatTask | undefined,
  ): Promise<ChatTask | undefined> => {
    if (
      !task ||
      !['running', 'stopping'].includes(task.status) ||
      (await isTaskExecuting(task.id))
    ) {
      return task
    }
    const result = await tryWithTaskExecution(task.id, async () => {
      const current = await store.get(task.id)
      if (!current || !['running', 'stopping'].includes(current.status))
        return current
      let recovered = current
      if (current.streamingText) {
        recovered = appendEvent(
          recovered,
          createEvent({
            text: current.streamingText,
            type: 'assistant-message',
          }),
        )
      }
      const { streamingText: _partial, ...withoutStreaming } = recovered
      recovered = setStatus(
        appendEvent(
          withoutStreaming,
          createEvent({
            text: 'This turn was interrupted. Send a message to continue. Applied edits have been kept.',
            type: 'assistant-message',
          }),
        ),
        'interrupted',
      )
      await store.save(recovered)
      return recovered
    })
    return result.acquired ? result.value : await store.get(task.id)
  }

  return {
    archiveTask(id) {
      return store.archive(id)
    },
    async createTask(message, modelId, options) {
      const now = new Date().toISOString()
      const task: ChatTask = {
        ...(workspaceUriProvider && {
          workspaceUri: await workspaceUriProvider(),
        }),
        createdAt: now,
        events: [
          createEvent({
            ...(options?.attachments && { attachments: options.attachments }),
            text: message,
            type: 'user-message',
          }),
        ],
        id: crypto.randomUUID(),
        modelId,
        status: 'idle',
        title: getTitle(message),
        updatedAt: now,
      }
      await store.save(task)
      await notify(task, options, store)
      void (async () => {
        try {
          if (!titleModelId || !backend.generateTitle) {
            return
          }
          const generatedResponse = await backend.generateTitle(
            message,
            titleModelId,
          )
          const generatedTitle = generatedResponse
            .trim()
            .replaceAll(titleWhitespacePattern, ' ')
            .replace(quotedTitlePattern, '$2')
          if (!generatedTitle) {
            return
          }
          const updated = await store.rename(
            task.id,
            capitalizeTitle(generatedTitle).slice(0, 80),
            true,
          )
          if (updated) {
            await notify((await store.get(task.id)) || updated, options, store)
          }
        } catch {
          // Keep the first-message title when title generation is unavailable.
        }
      })()
      const result = await run(task, message, options)
      return withStoredTitle(result, await store.get(task.id))
    },
    async getTask(id) {
      return recoverTask(await store.get(id))
    },
    listModels() {
      return backend.listModels()
    },
    async listTasks(limit) {
      const tasks = await store.list(limit)
      const recovered = await Promise.all(tasks.map(recoverTask))
      return recovered.filter((task): task is ChatTask => task !== undefined)
    },
    renameTask(id, title) {
      return store.rename(id, title)
    },
    async revertTask(task) {
      if (!providedToolHost) {
        throw new Error('Use Git to review and revert workspace changes.')
      }
      const files = await providedToolHost.revert()
      let updated = appendEvent(
        task,
        createEvent({ checksPassed: 0, files: [], type: 'changes' }),
      )
      updated = appendEvent(
        updated,
        createEvent({
          text:
            files.length > 0
              ? `Reverted ${files.length} changed ${files.length === 1 ? 'file' : 'files'}.`
              : 'There are no changes from the active turn to revert.',
          type: 'assistant-message',
        }),
      )
      await store.save(updated)
      return updated
    },
    async sendMessage(task, message, options) {
      return run(task, message, options, true)
    },
    async steer(taskId, message, attachments) {
      const messages = steering.get(taskId) || []
      steering.set(taskId, [
        ...messages,
        { ...(attachments && { attachments }), text: message },
      ])
    },
  }
}
