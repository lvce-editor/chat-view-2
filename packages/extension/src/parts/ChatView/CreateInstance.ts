import type { VirtualDomNode } from '@lvce-editor/virtual-dom-worker'
/* eslint-disable sonarjs/cognitive-complexity, unicorn/prefer-await */
import {
  executeCommand,
  getPreference,
  setPreference,
  type ViewContext,
  type ViewEvent,
  type VirtualDomViewInstance,
} from '@lvce-editor/api'
import { DragAndDropWorker, RendererWorker } from '@lvce-editor/rpc-registry'
import type { ChatApi, ChatTask } from '../ChatApi/ChatApi.ts'
import type { ChatViewState } from './ChatViewState.ts'
import type { ChatComposerImage } from './ChatViewState.ts'
import type { ReadPreference } from './FontSize.ts'
import {
  type BackendConfiguration,
  resolveBackendConfiguration,
} from '../BackendConfiguration/BackendConfiguration.ts'
import {
  getFocusMode,
  getFocusModeEnabled,
  toggleFocusMode,
} from '../ChatFocusMode/ChatFocusMode.ts'
import {
  isImageFile,
  loadImageAttachment,
} from '../ChatImageAttachments/ChatImageAttachments.ts'
import {
  getChatTaskHash,
  parseChatTaskHash,
} from '../ChatSessionUrl/ChatSessionUrl.ts'
import { setStatus } from '../ChatTask/ChatTask.ts'
import {
  createDefaultChatApi,
  type DefaultChatApiOptions,
} from '../DefaultChatApi/DefaultChatApi.ts'
import { initializeImageTransfer } from '../InitializeImageTransfer/InitializeImageTransfer.ts'
import { readAiNativeTheme } from './AiNativeTheme.ts'
import { isChatViewState } from './ChatViewComponentState.ts'
import { readFontFamily } from './FontFamily.ts'
import { readFontSize } from './FontSize.ts'
import { render } from './Render.ts'

export interface ActiveChatViewInstance extends VirtualDomViewInstance {
  readonly getContext: () => Readonly<Record<string, boolean>>
  readonly getState: () => Readonly<ChatViewState>
  readonly handleEvent: (event: Readonly<ViewEvent>) => Promise<void>
  readonly handleImageDrop: (dropId: unknown) => Promise<void>
  readonly handleImagePaste: (fileIds: unknown) => Promise<void>
  readonly handleKeyDown: (key: unknown) => void
  readonly handleSessionsSashPointerDown: (
    clientX: number,
    containerWidth: number,
    containerLeft: number,
    sessionsLeft: number,
    sessionsWidth: number,
  ) => void
  readonly handleSessionsSashPointerMove: (clientX: number) => void
  readonly handleSessionsSashPointerUp: () => void
  readonly newChat: (requestRerender?: boolean) => Promise<void>
  readonly render: () => readonly VirtualDomNode[]
  readonly renderFocus: (
    oldContext: Readonly<Record<string, boolean>>,
    newContext: Readonly<Record<string, boolean>>,
  ) => string
  readonly renderScrollPosition: () =>
    | readonly []
    | readonly [selector: string, scrollTop: number]
  readonly renderTitle: () => string
  readonly renderWorkbenchLayout: () => 'ide' | 'ai-native' | undefined
  readonly setState: (state: unknown) => void
  readonly submit: (requestRerender?: boolean) => Promise<void>
  readonly toggleFocusMode: (requestRerender?: boolean) => Promise<void>
}

interface SavedState {
  readonly draft?: string
  readonly selectedModelId?: string
  readonly selectedTaskId?: string
}

type MutableChatViewState = {
  -readonly [Key in keyof ChatViewState]: ChatViewState[Key]
}

type ExecuteCommand = (
  id: string,
  ...args: readonly unknown[]
) => Promise<unknown>

interface SessionsSashDrag {
  readonly containerWidth: number
  readonly isRight: boolean
  readonly startPointerX: number
  readonly startWidth: number
}

interface DefaultChatApiHost {
  readonly createApi: (options: DefaultChatApiOptions) => Promise<ChatApi>
  readonly resolveConfiguration: () => Promise<BackendConfiguration>
}

interface ImageTransferHost {
  readonly discardDrop: (dropId: number) => Promise<void>
  readonly getClipboardFiles: (
    fileIds: readonly number[],
  ) => Promise<readonly File[]>
  readonly getDroppedFiles: (dropId: number) => Promise<readonly File[]>
}

const defaultImageTransferHost: ImageTransferHost = {
  async discardDrop(dropId) {
    await initializeImageTransfer()
    await DragAndDropWorker.discardDrop(dropId)
  },
  async getClipboardFiles(fileIds) {
    await initializeImageTransfer()
    const items = await RendererWorker.getFileHandles(fileIds)
    const files = await Promise.all(
      items.map((item) => toImageFile(item.value)),
    )
    return files.filter((file): file is File => Boolean(file))
  },
  async getDroppedFiles(dropId) {
    await initializeImageTransfer()
    return DragAndDropWorker.getDroppedFilesByDropId(dropId)
  },
}

const defaultChatApiHost: DefaultChatApiHost = {
  createApi: createDefaultChatApi,
  resolveConfiguration: resolveBackendConfiguration,
}

const authStatePollInterval = 500
const copyFeedbackDuration = 2000
const messagesSelector = '.ChatMessages'
const maxScrollTop = 9_999_999
const workingTimerInterval = 1000
const defaultWindowTitle = 'Lvce Editor'
const defaultChatTitle = 'Chat 2'
const pathSeparatorRegex = /[\\/]/
const toImageFile = async (value: unknown): Promise<File | undefined> => {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  if ('arrayBuffer' in value && typeof value.arrayBuffer === 'function') {
    return value as File
  }
  if (
    'kind' in value &&
    value.kind === 'file' &&
    'getFile' in value &&
    typeof value.getFile === 'function'
  ) {
    return (value as FileSystemFileHandle).getFile()
  }
  return undefined
}

const isWorking = (task: ChatTask | undefined): boolean => {
  return task?.status === 'running' || task?.status === 'stopping'
}

const getWorkingStartedAt = (task: ChatTask): number => {
  const runningEvent = task.events.findLast(
    (event) => event.type === 'status' && event.status === 'running',
  )
  const userMessage = task.events.findLast(
    (event) => event.type === 'user-message',
  )
  const timestamp =
    runningEvent?.timestamp || userMessage?.timestamp || task.createdAt
  const startedAt = Date.parse(timestamp)
  return Number.isNaN(startedAt) ? Date.now() : startedAt
}

const getWorkingSeconds = (task: ChatTask): number => {
  return Math.max(
    0,
    Math.floor((Date.now() - getWorkingStartedAt(task)) / 1000),
  )
}

const getEventString = (event: Readonly<ViewEvent>): string => {
  return typeof event.value === 'string' ? event.value : ''
}

const getSavedState = (value: unknown): SavedState => {
  return value && typeof value === 'object' ? value : {}
}

const getHref = async (execute: ExecuteCommand): Promise<string> => {
  try {
    const href = await execute('Layout.getHref')
    return typeof href === 'string' ? href : ''
  } catch {
    return ''
  }
}

const setChatTaskHash = async (
  execute: ExecuteCommand,
  taskId?: string,
): Promise<void> => {
  try {
    await execute('Layout.setHash', taskId ? getChatTaskHash(taskId) : '')
  } catch {
    // Older editor builds do not expose the hash command.
  }
}

const activeInstances = new Set<ActiveChatViewInstance>()

const getPreferredModelId = async (): Promise<string> => {
  try {
    const value = await getPreference('chat2.selectedModelId')
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

const getActiveInstance = (): ActiveChatViewInstance | undefined => {
  return activeInstances.values().toArray().at(-1)
}

const getSelectedModelId = (
  models: ChatViewState['models'],
  preferredModelId: string,
): string => {
  return (
    models.find(
      (model) =>
        model.id === preferredModelId && model.available && model.planEligible,
    )?.id ||
    models.find((model) => model.available && model.planEligible)?.id ||
    ''
  )
}

const isSameBackendConfiguration = (
  oldConfiguration: BackendConfiguration,
  newConfiguration: BackendConfiguration,
): boolean => {
  return (
    oldConfiguration.accessToken === newConfiguration.accessToken &&
    oldConfiguration.loginRequired === newConfiguration.loginRequired &&
    oldConfiguration.baseUrl === newConfiguration.baseUrl &&
    oldConfiguration.supportsStreaming === newConfiguration.supportsStreaming
  )
}

const getModelLoadingError = (error: unknown): string => {
  return error instanceof Error && !(error instanceof TypeError)
    ? error.message
    : 'Chat Models could not be loaded from server'
}

export const submitActiveChatViewInstance = async (): Promise<void> => {
  await getActiveInstance()?.submit(true)
}

export const newChatInActiveChatViewInstance = async (): Promise<void> => {
  await getActiveInstance()?.newChat(true)
}

export const toggleActiveChatViewFocusMode = async (): Promise<void> => {
  await getActiveInstance()?.toggleFocusMode(true)
}

export const createInstance = async (
  context?: ViewContext,
  providedApi?: ChatApi,
  readPreference?: ReadPreference,
  execute: ExecuteCommand = executeCommand,
  defaultApiHost: DefaultChatApiHost = defaultChatApiHost,
  imageTransferHost: ImageTransferHost = defaultImageTransferHost,
): Promise<ActiveChatViewInstance> => {
  let pendingWorkbenchLayout: 'ide' | 'ai-native' | undefined
  let authenticationRejected = false
  let currentState: MutableChatViewState | undefined
  const onLoginRequired = (): void => {
    authenticationRejected = true
    if (currentState) {
      currentState.loginRequired = true
      currentState.errorMessage = ''
      void context?.requestRerender()
    }
  }
  let api: ChatApi
  let backendConfiguration: BackendConfiguration | undefined
  if (providedApi) {
    api = providedApi
  } else {
    backendConfiguration = await defaultApiHost.resolveConfiguration()
    api = await defaultApiHost.createApi({
      configuration: backendConfiguration,
      onLoginRequired,
    })
  }
  const saved = getSavedState(context?.state)
  let errorMessage = ''
  const models = backendConfiguration?.loginRequired
    ? []
    : await api.listModels().catch((error: unknown) => {
        errorMessage = getModelLoadingError(error)
        return []
      })
  const tasks = backendConfiguration?.loginRequired
    ? []
    : await api.listTasks(20).catch((error: unknown) => {
        errorMessage = error instanceof Error ? error.message : String(error)
        return []
      })
  const preferredModelId =
    saved.selectedModelId || (await getPreferredModelId())
  const fontFamily = await readFontFamily(readPreference)
  const fontSize = await readFontSize(readPreference)
  const aiNativeTheme = await readAiNativeTheme(readPreference)
  const selectedModelId = getSelectedModelId(models, preferredModelId)
  const href = await getHref(execute)
  const chatHash = parseChatTaskHash(href)
  const urlTask =
    chatHash.type === 'task'
      ? await api.getTask(chatHash.id).catch(() => undefined)
      : undefined
  const selectedTask =
    urlTask ||
    (saved.selectedTaskId
      ? await api.getTask(saved.selectedTaskId).catch(() => undefined)
      : undefined)
  if (chatHash.type === 'invalid') {
    await setChatTaskHash(execute)
  }
  const focusModeEnabled = await getFocusModeEnabled()
  const state: MutableChatViewState = {
    activityExpanded: false,
    aiNativeTheme,
    changesExpanded: false,
    composerFocused: false,
    composerImages: [],
    copiedMessageId: '',
    draft: typeof saved.draft === 'string' ? saved.draft : '',
    errorMessage,
    focusMode: focusModeEnabled && (await getFocusMode()),
    focusModeEnabled,
    fontFamily,
    fontSize,
    loginPending: false,
    loginRequired:
      authenticationRejected || backendConfiguration?.loginRequired === true,
    modelPickerOpen: false,
    models,
    selectedModelId,
    selectedTask,
    tasks,
    workingSeconds:
      selectedTask && isWorking(selectedTask)
        ? getWorkingSeconds(selectedTask)
        : 0,
  }
  let selectedTaskRequest = 0
  let focusComposerRequest = false
  let windowTitleQueue = Promise.resolve()
  let windowTitleActive = false
  const getWorkspaceTitle = async (): Promise<string> => {
    try {
      const workspacePath = await execute('Workspace.getPath')
      if (typeof workspacePath !== 'string' || !workspacePath) {
        return defaultWindowTitle
      }
      return (
        workspacePath.split(pathSeparatorRegex).at(-1) || defaultWindowTitle
      )
    } catch {
      return defaultWindowTitle
    }
  }
  const syncWindowTitle = (): Promise<void> => {
    if (state.focusMode) {
      windowTitleActive = true
    } else if (!windowTitleActive) {
      return Promise.resolve()
    }
    const title = state.focusMode
      ? state.selectedTask?.title || defaultChatTitle
      : undefined
    windowTitleQueue = windowTitleQueue
      .catch(() => {})
      .then(async () => {
        await execute('WindowTitle.set', title || (await getWorkspaceTitle()))
      })
    if (!state.focusMode) {
      windowTitleActive = false
    }
    return windowTitleQueue
  }
  currentState = state
  let activeController: AbortController | undefined
  let authStatePoll: ReturnType<typeof setInterval> | undefined
  let authStateSyncing = false
  let copyFeedbackTimeout: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let sessionsSashDrag: SessionsSashDrag | undefined
  let workingTimer: ReturnType<typeof setInterval> | undefined
  const archivedTaskIds = new Set<string>()
  let scrollToLatestTurn = state.focusMode && Boolean(state.selectedTask)

  const addImageFiles = async (files: readonly File[]): Promise<void> => {
    const imageFiles = files.filter(isImageFile)
    if (imageFiles.length === 0) {
      return
    }
    const loadingImages = imageFiles.map(
      (file): ChatComposerImage => ({
        id: `chat-image-${crypto.randomUUID()}`,
        name: file.name,
        status: 'loading',
      }),
    )
    state.composerImages = [...state.composerImages, ...loadingImages]
    await context?.requestRerender()
    await Promise.all(
      imageFiles.map(async (file, index) => {
        const loadingImage = loadingImages[index]
        if (!loadingImage) {
          return
        }
        try {
          const attachment = await loadImageAttachment(file)
          state.composerImages = state.composerImages.map((image) =>
            image.id === loadingImage.id
              ? { ...image, attachment, status: 'ready' }
              : image,
          )
        } catch {
          state.composerImages = state.composerImages.map((image) =>
            image.id === loadingImage.id
              ? { ...image, status: 'error' }
              : image,
          )
        }
        await context?.requestRerender()
      }),
    )
  }

  const stopWorkingTimer = (): void => {
    if (workingTimer === undefined) {
      return
    }
    clearInterval(workingTimer)
    workingTimer = undefined
  }

  const syncWorkingTimer = (task: ChatTask | undefined): void => {
    if (!task || !isWorking(task)) {
      stopWorkingTimer()
      state.workingSeconds = 0
      return
    }
    state.workingSeconds = getWorkingSeconds(task)
    if (workingTimer !== undefined) {
      return
    }
    workingTimer = setInterval(() => {
      const { selectedTask } = state
      if (!selectedTask || !isWorking(selectedTask)) {
        stopWorkingTimer()
        return
      }
      state.workingSeconds = getWorkingSeconds(selectedTask)
      void context?.requestRerender()
    }, workingTimerInterval)
  }

  const resetCopyFeedback = (): void => {
    if (copyFeedbackTimeout) {
      clearTimeout(copyFeedbackTimeout)
      copyFeedbackTimeout = undefined
    }
    state.copiedMessageId = ''
  }

  const showCopyFeedback = (messageId: string): void => {
    resetCopyFeedback()
    state.copiedMessageId = messageId
    copyFeedbackTimeout = setTimeout(() => {
      copyFeedbackTimeout = undefined
      state.copiedMessageId = ''
      void context?.requestRerender()
    }, copyFeedbackDuration)
  }

  const syncAuthState = async (
    retryLogin = false,
    requestRerender = true,
  ): Promise<void> => {
    if (
      !backendConfiguration ||
      (state.loginRequired && !retryLogin) ||
      authStateSyncing ||
      activeController ||
      disposed
    ) {
      return
    }
    authStateSyncing = true
    try {
      const nextConfiguration = await defaultApiHost.resolveConfiguration()
      if (
        disposed ||
        (!retryLogin &&
          isSameBackendConfiguration(backendConfiguration, nextConfiguration))
      ) {
        return
      }
      authenticationRejected = false
      const nextApi = await defaultApiHost.createApi({
        configuration: nextConfiguration,
        onLoginRequired,
      })
      const nextModels = nextConfiguration.loginRequired
        ? []
        : await nextApi.listModels().catch((error: unknown) => {
            state.errorMessage = getModelLoadingError(error)
            return []
          })
      if (disposed) {
        return
      }
      api = nextApi
      backendConfiguration = nextConfiguration
      state.loginRequired =
        authenticationRejected || nextConfiguration.loginRequired === true
      if (state.loginRequired) {
        state.errorMessage = ''
      }
      state.models = nextModels
      state.selectedModelId = getSelectedModelId(
        nextModels,
        state.selectedModelId,
      )
      if (nextModels.length > 0) {
        state.errorMessage = ''
      }
      if (requestRerender) {
        await context?.requestRerender()
      }
    } catch (error) {
      if (!disposed) {
        state.errorMessage = getModelLoadingError(error)
        if (requestRerender) {
          await context?.requestRerender()
        }
      }
    } finally {
      authStateSyncing = false
    }
  }

  const newChat = async (requestRerender = false): Promise<void> => {
    selectedTaskRequest++
    resetCopyFeedback()
    state.selectedTask = undefined
    await setChatTaskHash(execute)
    state.draft = ''
    state.composerImages = []
    state.activityExpanded = false
    state.changesExpanded = false
    syncWorkingTimer(undefined)
    void syncWindowTitle().catch(() => {})
    focusComposerRequest = !focusComposerRequest
    if (requestRerender) {
      await context?.requestRerender()
    }
  }

  const setTask = async (task: ChatTask): Promise<void> => {
    if (archivedTaskIds.has(task.id)) {
      return
    }
    const taskChanged = state.selectedTask?.id !== task.id
    state.selectedTask = task
    if (taskChanged) {
      await setChatTaskHash(execute, task.id)
    }
    syncWorkingTimer(task)
    state.tasks = [
      task,
      ...state.tasks.filter((item) => item.id !== task.id),
    ].slice(0, 20)
    void syncWindowTitle().catch(() => {})
  }

  const updateTask = async (
    task: ChatTask,
    request = selectedTaskRequest,
  ): Promise<void> => {
    if (disposed || request !== selectedTaskRequest) {
      return
    }
    await setTask(task)
    await context?.requestRerender()
  }

  const submit = async (requestRerender = false): Promise<void> => {
    const message = state.draft.trim()
    const attachments = state.composerImages.flatMap((image) =>
      image.status === 'ready' && image.attachment ? [image.attachment] : [],
    )
    if (
      state.loginRequired ||
      (!message && attachments.length === 0) ||
      state.composerImages.some((image) => image.status !== 'ready') ||
      !state.selectedModelId
    ) {
      return
    }
    if (activeController && state.selectedTask?.status !== 'running') {
      return
    }
    if (state.focusMode) {
      scrollToLatestTurn = true
    }
    state.draft = ''
    state.composerImages = []
    state.modelPickerOpen = false
    if (state.selectedTask?.status === 'running') {
      await api.steer(state.selectedTask.id, message, attachments)
      if (requestRerender) {
        await context?.requestRerender()
      }
      return
    }
    activeController = new AbortController()
    const request = selectedTaskRequest
    const options = {
      attachments,
      onUpdate: (task: ChatTask): Promise<void> => updateTask(task, request),
      signal: activeController.signal,
    }
    const selectedTask = state.selectedTask
      ? { ...state.selectedTask, modelId: state.selectedModelId }
      : undefined
    try {
      const task = selectedTask
        ? await api.sendMessage(selectedTask, message, options)
        : await api.createTask(message, state.selectedModelId, options)
      await updateTask(task)
    } finally {
      activeController = undefined
    }
    if (requestRerender) {
      await context?.requestRerender()
    }
  }

  const handleToggleFocusMode = async (
    requestRerender = false,
  ): Promise<void> => {
    if (!state.focusModeEnabled) {
      return
    }
    state.focusMode = await getFocusMode(execute)
    state.focusMode = toggleFocusMode(state)
    pendingWorkbenchLayout = state.focusMode ? 'ai-native' : 'ide'
    await syncWindowTitle()
    if (requestRerender) {
      await context?.requestRerender()
    }
  }

  const completeLogin = async (): Promise<void> => {
    try {
      await execute('Layout.signIn')
      await syncAuthState(true, false)
    } catch (error) {
      state.errorMessage =
        error instanceof Error ? error.message : String(error)
    } finally {
      state.loginPending = false
      if (!disposed) {
        try {
          await context?.requestRerender()
        } catch {
          // The event response already renders the pending state.
        }
      }
    }
  }

  const instance: ActiveChatViewInstance = {
    dispose(): void {
      disposed = true
      if (state.focusMode) {
        void syncWindowTitle().catch(() => {})
      }
      currentState = undefined
      activeController?.abort()
      if (authStatePoll !== undefined) {
        clearInterval(authStatePoll)
        authStatePoll = undefined
      }
      resetCopyFeedback()
      stopWorkingTimer()
      activeInstances.delete(instance)
    },
    getContext(): Readonly<Record<string, boolean>> {
      return {
        'chat2.composerFocus': state.composerFocused,
        'chat2.focusComposerRequest': focusComposerRequest,
        'chat2.focusMode': state.focusMode,
        'chat2.taskRunning': state.selectedTask?.status === 'running',
      }
    },
    getState(): Readonly<ChatViewState> {
      return state
    },
    async handleEvent(event: Readonly<ViewEvent>): Promise<void> {
      if (event.type === 'click' && event.name === 'login') {
        if (!state.loginRequired || state.loginPending) {
          return
        }
        state.loginPending = true
        state.errorMessage = ''
        // The host serializes view commands. Finish the event first so a
        // rerender requested after sign-in can run without queuing behind it.
        void completeLogin()
        return
      }
      if (state.loginRequired) {
        return
      }
      if (event.type === 'input' && event.name === 'composer') {
        state.composerFocused = true
        state.draft = getEventString(event)
        return
      }
      if (event.type === 'click' && event.name?.startsWith('remove-image:')) {
        const imageId = event.name.slice('remove-image:'.length)
        state.composerImages = state.composerImages.filter(
          (image) => image.id !== imageId,
        )
        return
      }
      if (event.type === 'focus' && event.name === 'composer') {
        state.composerFocused = true
        return
      }
      if (event.type === 'blur' && event.name === 'composer') {
        state.composerFocused = false
        return
      }
      if (event.type !== 'click') {
        return
      }
      if (event.name === 'submit') {
        // Rendering is serialized behind this event by the host.
        void submit()
          .catch(async (error: unknown) => {
            if (disposed) {
              return
            }
            state.errorMessage =
              error instanceof Error ? error.message : String(error)
            await context?.requestRerender()
          })
          .catch(() => {})
        return
      }
      if (event.name === 'toggle-focus-mode') {
        await handleToggleFocusMode()
        return
      }
      if (event.name === 'stop') {
        if (state.selectedTask?.status === 'running') {
          await setTask(setStatus(state.selectedTask, 'stopping'))
        }
        activeController?.abort()
        return
      }
      if (event.name === 'back' || event.name === 'new-task') {
        await newChat()
        return
      }
      if (event.name === 'model-picker') {
        state.modelPickerOpen = !state.modelPickerOpen
        return
      }
      if (event.name === 'toggle-activity') {
        state.activityExpanded = !state.activityExpanded
        return
      }
      if (event.name === 'toggle-changes') {
        state.changesExpanded = !state.changesExpanded
        return
      }
      if (event.name === 'revert' && state.selectedTask) {
        try {
          await setTask(await api.revertTask(state.selectedTask))
          state.errorMessage = ''
        } catch (error) {
          state.errorMessage =
            error instanceof Error ? error.message : String(error)
        }
        return
      }
      if (event.name?.startsWith('copy-message:') && state.selectedTask) {
        const eventId = event.name.slice('copy-message:'.length)
        const message = state.selectedTask.events.find(
          (item) =>
            item.id === eventId &&
            (item.type === 'assistant-message' || item.type === 'user-message'),
        )
        if (
          message?.type === 'assistant-message' ||
          message?.type === 'user-message'
        ) {
          await execute('ClipBoard.writeText', message.text)
          showCopyFeedback(message.id)
        }
        return
      }
      if (event.name?.startsWith('archive-task:')) {
        const id = event.name.slice('archive-task:'.length)
        if (state.tasks.every((task) => task.id !== id)) {
          return
        }
        try {
          await api.archiveTask(id)
          archivedTaskIds.add(id)
          state.tasks = state.tasks.filter((task) => task.id !== id)
          state.errorMessage = ''
        } catch (error) {
          state.errorMessage =
            error instanceof Error ? error.message : String(error)
        }
        return
      }
      if (event.name?.startsWith('model:')) {
        const id = event.name.slice(6)
        const model = state.models.find((item) => item.id === id)
        if (model?.available && model.planEligible) {
          state.selectedModelId = id
          state.modelPickerOpen = false
          await setPreference('chat2.selectedModelId', id)
        }
        return
      }
      if (event.name?.startsWith('task:')) {
        const request = ++selectedTaskRequest
        resetCopyFeedback()
        const task = await api.getTask(event.name.slice(5))
        if (disposed || request !== selectedTaskRequest) {
          return
        }
        state.selectedTask = task
        scrollToLatestTurn = state.focusMode && Boolean(task)
        syncWorkingTimer(state.selectedTask)
        if (state.selectedTask) {
          state.selectedModelId = state.selectedTask.modelId
          await setChatTaskHash(execute, state.selectedTask.id)
        } else {
          await setChatTaskHash(execute)
        }
        state.draft = ''
        state.composerImages = []
        state.activityExpanded = false
        state.changesExpanded = false
        void syncWindowTitle().catch(() => {})
      }
    },
    async handleImageDrop(dropId: unknown): Promise<void> {
      if (typeof dropId !== 'number') {
        return
      }
      try {
        const files = await imageTransferHost.getDroppedFiles(dropId)
        await addImageFiles(files)
      } catch (error) {
        state.errorMessage =
          error instanceof Error ? error.message : String(error)
        await context?.requestRerender()
      } finally {
        await imageTransferHost.discardDrop(dropId).catch(() => {})
      }
    },
    async handleImagePaste(fileIds: unknown): Promise<void> {
      if (
        !Array.isArray(fileIds) ||
        fileIds.some((id) => typeof id !== 'number')
      ) {
        return
      }
      try {
        const files = await imageTransferHost.getClipboardFiles(fileIds)
        await addImageFiles(files)
      } catch (error) {
        state.errorMessage =
          error instanceof Error ? error.message : String(error)
        await context?.requestRerender()
      }
    },
    handleKeyDown(key: unknown): void {
      if (key === 'Escape' && state.modelPickerOpen) {
        state.modelPickerOpen = false
      }
    },
    handleSessionsSashPointerDown(
      clientX: number,
      containerWidth: number,
      containerLeft: number,
      sessionsLeft: number,
      sessionsWidth: number,
    ): void {
      if (
        !Number.isFinite(clientX) ||
        !Number.isFinite(containerWidth) ||
        containerWidth <= 0 ||
        !Number.isFinite(containerLeft) ||
        !Number.isFinite(sessionsLeft) ||
        !Number.isFinite(sessionsWidth)
      ) {
        return
      }
      sessionsSashDrag = {
        containerWidth,
        isRight: sessionsLeft - containerLeft > containerWidth / 2,
        startPointerX: clientX,
        startWidth: sessionsWidth,
      }
    },
    handleSessionsSashPointerMove(clientX: number): void {
      const drag = sessionsSashDrag
      if (!drag || !Number.isFinite(clientX)) {
        return
      }
      const minimumWidth = Math.min(160, drag.containerWidth / 2)
      const maximumWidth = Math.max(
        minimumWidth,
        drag.containerWidth - Math.min(320, drag.containerWidth / 2),
      )
      const pointerDelta = clientX - drag.startPointerX
      const width =
        drag.startWidth + (drag.isRight ? -pointerDelta : pointerDelta)
      state.sessionsWidth = Math.max(
        minimumWidth,
        Math.min(maximumWidth, width),
      )
    },
    handleSessionsSashPointerUp(): void {
      sessionsSashDrag = undefined
    },
    newChat,
    render(): readonly VirtualDomNode[] {
      return render(state)
    },
    renderFocus(
      oldContext: Readonly<Record<string, boolean>>,
      newContext: Readonly<Record<string, boolean>>,
    ): string {
      return (oldContext['chat2.focusComposerRequest'] ?? false) ===
        (newContext['chat2.focusComposerRequest'] ?? false)
        ? ''
        : 'textarea[name="composer"]'
    },
    renderScrollPosition():
      | readonly []
      | readonly [selector: string, scrollTop: number] {
      if (state.focusMode) {
        if (!scrollToLatestTurn) {
          return []
        }
        scrollToLatestTurn = false
      }
      return [messagesSelector, maxScrollTop]
    },
    renderTitle(): string {
      return state.selectedTask
        ? `Chat 2: ${state.selectedTask.title}`
        : 'Chat 2'
    },
    renderWorkbenchLayout() {
      const layout = pendingWorkbenchLayout
      pendingWorkbenchLayout = undefined
      return layout
    },
    saveState(): unknown {
      return {
        draft: state.draft,
        selectedModelId: state.selectedModelId,
        selectedTaskId: state.selectedTask?.id,
      }
    },
    setState(newState: unknown): void {
      if (!isChatViewState(newState)) {
        throw new TypeError('Chat 2 state must be a valid state object')
      }
      Object.assign(state, {
        ...newState,
        composerImages: newState.composerImages || [],
        selectedTask: newState.selectedTask,
      })
      syncWorkingTimer(state.selectedTask)
    },
    submit,
    toggleFocusMode: handleToggleFocusMode,
  }
  syncWorkingTimer(selectedTask)
  void syncWindowTitle().catch(() => {})
  if (backendConfiguration?.baseUrl) {
    authStatePoll = setInterval(() => {
      void syncAuthState()
    }, authStatePollInterval)
  }
  activeInstances.add(instance)
  return instance
}
