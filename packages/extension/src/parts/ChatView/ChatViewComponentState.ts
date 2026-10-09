import type {
  ChatModel,
  ChatTask,
  ChatTaskEvent,
  ChatTaskStatus,
} from '../ChatApi/ChatApi.ts'
import type { ChatViewState } from './ChatViewState.ts'

const taskStatuses = new Set<ChatTaskStatus>([
  'completed',
  'failed',
  'idle',
  'running',
  'stopping',
])

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const isChatModel = (value: unknown): value is ChatModel => {
  return (
    isRecord(value) &&
    typeof value.available === 'boolean' &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.planEligible === 'boolean'
  )
}

const isChatTaskEvent = (value: unknown): value is ChatTaskEvent => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.timestamp !== 'string' ||
    typeof value.type !== 'string'
  ) {
    return false
  }
  switch (value.type) {
    case 'activity':
      return (
        typeof value.label === 'string' &&
        typeof value.status === 'string' &&
        ['completed', 'failed', 'running'].includes(value.status)
      )
    case 'assistant-message':
    case 'user-message':
      return (
        typeof value.text === 'string' &&
        (value.attachments === undefined ||
          (Array.isArray(value.attachments) &&
            value.attachments.every(
              (attachment) =>
                isRecord(attachment) &&
                typeof attachment.dataUrl === 'string' &&
                typeof attachment.mimeType === 'string' &&
                typeof attachment.name === 'string',
            )))
      )
    case 'changes':
      return (
        typeof value.checksPassed === 'number' &&
        Array.isArray(value.files) &&
        value.files.every((file) => {
          return (
            isRecord(file) &&
            typeof file.additions === 'number' &&
            typeof file.deletions === 'number' &&
            typeof file.path === 'string' &&
            ['added', 'deleted', 'modified'].includes(String(file.status))
          )
        })
      )
    case 'error':
      return typeof value.message === 'string'
    case 'status':
      return (
        typeof value.status === 'string' &&
        taskStatuses.has(value.status as ChatTaskStatus)
      )
    default:
      return false
  }
}

const isChatTask = (value: unknown): value is ChatTask => {
  return (
    isRecord(value) &&
    typeof value.createdAt === 'string' &&
    Array.isArray(value.events) &&
    value.events.every(isChatTaskEvent) &&
    typeof value.id === 'string' &&
    typeof value.modelId === 'string' &&
    typeof value.status === 'string' &&
    taskStatuses.has(value.status as ChatTaskStatus) &&
    typeof value.title === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

const booleanStateKeys = [
  'activityExpanded',
  'changesExpanded',
  'composerFocused',
  'focusMode',
  'focusModeEnabled',
  'loginPending',
  'loginRequired',
  'modelPickerOpen',
  'sessionsVisible',
] as const

const stringStateKeys = [
  'copiedMessageId',
  'draft',
  'errorMessage',
  'fontFamily',
  'fontSize',
  'selectedModelId',
] as const

export const isChatViewState = (value: unknown): value is ChatViewState => {
  if (!isRecord(value)) {
    return false
  }
  if (booleanStateKeys.some((key) => typeof value[key] !== 'boolean')) {
    return false
  }
  if (stringStateKeys.some((key) => typeof value[key] !== 'string')) {
    return false
  }
  if (
    value.composerImages !== undefined &&
    (!Array.isArray(value.composerImages) ||
      value.composerImages.some(
        (image) =>
          !isRecord(image) ||
          typeof image.id !== 'string' ||
          typeof image.name !== 'string' ||
          !['error', 'loading', 'ready'].includes(String(image.status)),
      ))
  ) {
    return false
  }
  return (
    (value.sessionsWidth === undefined ||
      (typeof value.sessionsWidth === 'number' &&
        Number.isFinite(value.sessionsWidth) &&
        value.sessionsWidth > 0)) &&
    Array.isArray(value.models) &&
    value.models.every(isChatModel) &&
    (value.selectedTask === undefined || isChatTask(value.selectedTask)) &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isChatTask) &&
    (value.taskOpenMode === 'click' || value.taskOpenMode === 'mousedown') &&
    typeof value.workingSeconds === 'number' &&
    Number.isFinite(value.workingSeconds) &&
    value.workingSeconds >= 0
  )
}
