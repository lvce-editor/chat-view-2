/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types, sonarjs/cognitive-complexity, sonarjs/no-nested-conditional, unicorn/no-top-level-assignment-in-function */
import type { AgentBackend, AgentInput } from '../AgentBackend/AgentBackend.ts'
import type {
  AgentToolCall,
  AgentToolHost,
  AgentToolResult,
} from '../AgentToolHost/AgentToolHost.ts'
import type {
  ChatApi,
  ChatRunOptions,
  ChatTask,
  ChatTaskEvent,
  ChatTraceMessage,
} from '../ChatApi/ChatApi.ts'
import type { TaskStore } from '../TaskStore/TaskStore.ts'
import { appendEvent, createEvent, setStatus } from '../ChatTask/ChatTask.ts'

export interface AgentChatApiOptions {
  readonly backend: AgentBackend
  readonly maxSteps?: number
  readonly store: TaskStore
  readonly toolHost: AgentToolHost
}

const readOnlyTools = new Set([
  'get_diagnostics',
  'get_workspace_uri',
  'read_file',
  'search_workspace',
])

let nextTaskId = 1

const getTitle = (message: string): string => {
  const firstLine = message.split('\n', 1)[0]?.trim() || 'New task'
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
}

const notify = async (
  task: ChatTask,
  options?: ChatRunOptions,
): Promise<void> => {
  await options?.onUpdate?.(task)
}

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
  await notify(updated, options)
  return updated
}

const getActivityLabel = (call: AgentToolCall): string => {
  switch (call.name) {
    case 'apply_patch':
      return 'Editing workspace'
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

export const createAgentChatApi = ({
  backend,
  maxSteps = 30,
  store,
  toolHost,
}: AgentChatApiOptions): ChatApi => {
  const steering = new Map<string, string[]>()

  const run = async (
    initialTask: ChatTask,
    message: string,
    options?: ChatRunOptions,
  ): Promise<ChatTask> => {
    let task = setStatus(initialTask, 'running')
    await trace(
      {
        content: message,
        role: 'user',
        timestamp: Date.now(),
      },
      options,
    )
    toolHost.beginTurn(task.id)
    await store.save(task)
    await notify(task, options)
    let input: readonly AgentInput[] = [
      {
        content: `${await toolHost.getWorkspaceContext()}\n\nUser task:\n${message}`,
        role: 'user',
      },
    ]
    let previousResponseId = task.responseId
    let streamedText = ''
    let lastStreamRender = 0
    try {
      for (let step = 0; step < maxSteps; step++) {
        options?.signal?.throwIfAborted()
        const queued = steering.get(task.id) || []
        steering.delete(task.id)
        if (queued.length > 0) {
          for (const steeringMessage of queued) {
            task = await withEvent(
              task,
              createEvent({ text: steeringMessage, type: 'user-message' }),
              store,
              options,
            )
          }
          input = [
            ...input,
            {
              content: `User steering update:\n${queued.join('\n')}`,
              role: 'user',
            },
          ]
        }
        const result = await backend.runStep({
          input,
          modelId: task.modelId,
          onTextDelta: async (delta) => {
            streamedText += delta
            const now = performance.now()
            if (now - lastStreamRender >= 50) {
              task = { ...task, streamingText: streamedText }
              lastStreamRender = now
              await notify(task, options)
            }
          },
          ...(previousResponseId && { previousResponseId }),
          ...(options?.signal && { signal: options.signal }),
          tools: toolHost.getDefinitions(),
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
          ...(previousResponseId && { responseId: previousResponseId }),
        }
        streamedText = ''
        const lateSteering = steering.get(task.id) || []
        if (result.toolCalls.length === 0 && lateSteering.length > 0) {
          steering.delete(task.id)
          for (const steeringMessage of lateSteering) {
            task = await withEvent(
              task,
              createEvent({ text: steeringMessage, type: 'user-message' }),
              store,
              options,
            )
          }
          input = lateSteering.map((steeringMessage) => ({
            content: `User steering update:\n${steeringMessage}`,
            role: 'user' as const,
          }))
          continue
        }
        if (result.toolCalls.length === 0) {
          const files = toolHost.getChangedFiles()
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
          await notify(task, options)
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
        await notify(task, options)
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
        input = result.toolCalls.map((call, index) => ({
          callId: call.callId,
          output: outputs[index].modelOutput || outputs[index].content,
          type: 'function-call-output' as const,
        }))
        await store.save(task)
        await notify(task, options)
      }
      throw new Error(`Agent stopped after ${maxSteps} steps`)
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        task = await withEvent(
          task,
          createEvent({ text: 'Stopped.', type: 'assistant-message' }),
          store,
          options,
        )
        task = setStatus(task, 'completed')
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
      await notify(task, options)
      return task
    }
  }

  return {
    archiveTask(id) {
      return store.archive(id)
    },
    async createTask(message, modelId, options) {
      const now = new Date().toISOString()
      const task: ChatTask = {
        createdAt: now,
        events: [createEvent({ text: message, type: 'user-message' })],
        id: `task-${Date.now()}-${nextTaskId++}`,
        modelId,
        status: 'idle',
        title: getTitle(message),
        updatedAt: now,
      }
      await store.save(task)
      await notify(task, options)
      return run(task, message, options)
    },
    getTask(id) {
      return store.get(id)
    },
    listModels() {
      return backend.listModels()
    },
    listTasks(limit) {
      return store.list(limit)
    },
    async revertTask(task) {
      const files = await toolHost.revert()
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
      const updated = appendEvent(
        task,
        createEvent({ text: message, type: 'user-message' }),
      )
      await store.save(updated)
      await notify(updated, options)
      return run(updated, message, options)
    },
    async steer(taskId, message) {
      const messages = steering.get(taskId) || []
      steering.set(taskId, [...messages, message])
    },
  }
}
