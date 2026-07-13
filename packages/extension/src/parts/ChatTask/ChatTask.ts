/* eslint-disable prefer-destructuring, unicorn/no-break-in-nested-loop, unicorn/no-top-level-assignment-in-function, unicorn/prefer-minimal-ternary */
import type {
  ChatActivityEvent,
  ChatAssistantMessageEvent,
  ChatChangedFile,
  ChatChangesEvent,
  ChatErrorEvent,
  ChatStatusEvent,
  ChatTask,
  ChatTaskEvent,
  ChatTaskStatus,
  ChatUserMessageEvent,
} from '../ChatApi/ChatApi.ts'

export interface ChatTaskSummary {
  readonly activities: readonly Extract<ChatTaskEvent, { type: 'activity' }>[]
  readonly changedFiles: readonly ChatChangedFile[]
  readonly checksPassed: number
  readonly errorMessage: string
  readonly messages: readonly (
    | Extract<ChatTaskEvent, { type: 'assistant-message' }>
    | Extract<ChatTaskEvent, { type: 'user-message' }>
  )[]
}

let nextEventId = 1

export function createEvent(
  event: Omit<ChatActivityEvent, 'id' | 'timestamp'>,
): ChatActivityEvent
export function createEvent(
  event: Omit<ChatAssistantMessageEvent, 'id' | 'timestamp'>,
): ChatAssistantMessageEvent
export function createEvent(
  event: Omit<ChatChangesEvent, 'id' | 'timestamp'>,
): ChatChangesEvent
export function createEvent(
  event: Omit<ChatErrorEvent, 'id' | 'timestamp'>,
): ChatErrorEvent
export function createEvent(
  event: Omit<ChatStatusEvent, 'id' | 'timestamp'>,
): ChatStatusEvent
export function createEvent(
  event: Omit<ChatUserMessageEvent, 'id' | 'timestamp'>,
): ChatUserMessageEvent
export function createEvent(
  event:
    | Omit<ChatActivityEvent, 'id' | 'timestamp'>
    | Omit<ChatAssistantMessageEvent, 'id' | 'timestamp'>
    | Omit<ChatChangesEvent, 'id' | 'timestamp'>
    | Omit<ChatErrorEvent, 'id' | 'timestamp'>
    | Omit<ChatStatusEvent, 'id' | 'timestamp'>
    | Omit<ChatUserMessageEvent, 'id' | 'timestamp'>,
): ChatTaskEvent {
  return {
    ...event,
    id: `event-${nextEventId++}`,
    timestamp: new Date().toISOString(),
  }
}

export const appendEvent = (task: ChatTask, event: ChatTaskEvent): ChatTask => {
  const status = event.type === 'status' ? event.status : task.status
  return {
    ...task,
    events: [...task.events, event],
    status,
    updatedAt: event.timestamp,
  }
}

export const replaceActivity = (
  task: ChatTask,
  activity: Extract<ChatTaskEvent, { type: 'activity' }>,
): ChatTask => {
  const index = task.events.findIndex((event) => event.id === activity.id)
  if (index === -1) {
    return appendEvent(task, activity)
  }
  return {
    ...task,
    events: task.events.with(index, activity),
    updatedAt: activity.timestamp,
  }
}

export const setStatus = (task: ChatTask, status: ChatTaskStatus): ChatTask => {
  return appendEvent(
    task,
    createEvent({
      status,
      type: 'status',
    }),
  )
}

export const summarizeTask = (task: ChatTask): ChatTaskSummary => {
  let changedFiles: readonly ChatChangedFile[] = []
  let checksPassed = 0
  let errorMessage = ''
  const activities: Extract<ChatTaskEvent, { type: 'activity' }>[] = []
  const messages: ChatTaskSummary['messages'][number][] = []
  for (const event of task.events) {
    switch (event.type) {
      case 'activity': {
        activities.push(event)

        break
      }
      case 'assistant-message':
      case 'user-message': {
        messages.push(event)

        break
      }
      case 'changes': {
        changedFiles = event.files
        checksPassed = event.checksPassed

        break
      }
      case 'error': {
        errorMessage = event.message

        break
      }
      // No default
    }
  }
  return {
    activities,
    changedFiles,
    checksPassed,
    errorMessage,
    messages,
  }
}

export const getTaskPreview = (task: ChatTask): string => {
  const summary = summarizeTask(task)
  return summary.messages.at(-1)?.text ?? task.title
}
