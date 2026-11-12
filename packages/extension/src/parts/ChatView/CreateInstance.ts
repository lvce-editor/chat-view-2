import type { VirtualDomNode } from '@lvce-editor/virtual-dom-worker'
import {
  executeCommand,
  getPreference,
  getWorkspaceUri,
  setPreference,
  writeClipboardText as writeClipboardTextApi,
  type MenuEntry,
  type ViewContext,
  type ViewEvent,
  type VirtualDomViewInstance,
} from '@lvce-editor/api'
/* eslint-disable sonarjs/cognitive-complexity, unicorn/prefer-await */
import { getWorkspaceRelativePath } from '@lvce-editor/chat-tool-worker/parts/AgentToolHost/AgentToolHost.ts'
import { DragAndDropWorker } from '@lvce-editor/rpc-registry'
import type {
  ChatApi,
  ChatImageAttachment,
  ChatTask,
} from '../ChatApi/ChatApi.ts'
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
import { createChatImageCache } from '../ChatImageCache/ChatImageCache.ts'
import {
  getUrl,
  getChatTaskHash,
  getChatPath,
  getIdePath,
  isChatPath,
  parseChatTaskHash,
} from '../ChatSessionUrl/ChatSessionUrl.ts'
import { createEvent, setStatus } from '../ChatTask/ChatTask.ts'
import {
  createDefaultChatApi,
  type DefaultChatApiOptions,
} from '../DefaultChatApi/DefaultChatApi.ts'
import {
  getFileHandles,
  initializeImageTransfer,
} from '../InitializeImageTransfer/InitializeImageTransfer.ts'
import {
  readDraft,
  writeDraft,
  taskStoreChannelName,
} from '../TaskStore/TaskStore.ts'
import { readAiNativeTheme } from './AiNativeTheme.ts'
import { isChatViewState } from './ChatViewComponentState.ts'
import { getZoomCommand } from './ChatViewZoom.ts'
import {
  assistantMessageFontFamilyPreference,
  defaultAssistantMessageFontFamily,
  defaultUserMessageFontFamily,
  readFontFamily,
  readMessageFontFamily,
  userMessageFontFamilyPreference,
} from './FontFamily.ts'
import { readFontSize } from './FontSize.ts'
import { getMathExpressions, type MathExpression } from './MathExpressions.ts'
import { getCodeBlockText, render, renderCss } from './Render.ts'
import { readTaskOpenMode } from './TaskOpenMode.ts'

const hasUnresolvedTaskImages = (task: ChatTask): boolean =>
  task.events.some(
    (event) =>
      (event.type === 'assistant-message' &&
        event.images?.some((image) => !image.objectUrl)) ||
      (event.type === 'user-message' &&
        event.attachments?.some((image) => !image.objectUrl)),
  )

const hasUnresolvedComposerImages = (
  images: readonly ChatComposerImage[],
): boolean =>
  images.some((image) => image.attachment && !image.attachment.objectUrl)

const getTaskImages = (task: ChatTask): readonly ChatImageAttachment[] =>
  task.events.flatMap((event): readonly ChatImageAttachment[] => {
    if (event.type === 'assistant-message') {
      return event.images || []
    }
    if (event.type === 'user-message') {
      return event.attachments || []
    }
    return []
  })

const removeObjectUrl = (image: ChatImageAttachment): ChatImageAttachment => {
  const { objectUrl: _objectUrl, ...persistedImage } = image
  return persistedImage
}

const removeObjectUrls = (task: ChatTask): ChatTask => ({
  ...task,
  events: task.events.map((event) => {
    if (event.type === 'assistant-message' && event.images) {
      return {
        ...event,
        images: event.images.map(removeObjectUrl),
      }
    }
    if (event.type === 'user-message' && event.attachments) {
      return {
        ...event,
        attachments: event.attachments.map(removeObjectUrl),
      }
    }
    return event
  }),
})

export interface ActiveChatViewInstance extends VirtualDomViewInstance {
  readonly getContext: () => Readonly<Record<string, boolean>>
  readonly getCss: () => string
  readonly getMenuEntries: (menuId: string) => readonly MenuEntry[]
  readonly getQuickPickItems: () => readonly {
    readonly id: string
    readonly title: string
  }[]
  readonly getState: () => Readonly<ChatViewState>
  readonly handleDragOver: () => void
  readonly handleEvent: (event: Readonly<ViewEvent>) => Promise<void>
  readonly handleImageDrop: (dropId: unknown) => Promise<void>
  readonly handleImagePaste: (
    fileIds: unknown,
    text?: unknown,
    selectionStart?: unknown,
    selectionEnd?: unknown,
  ) => Promise<void>
  readonly handleKeyDown: (
    key: unknown,
    ctrlKey?: unknown,
    metaKey?: unknown,
    shiftKey?: unknown,
  ) => void
  readonly handleModelPickerOutsideClick: (
    name: unknown,
    value: unknown,
  ) => void
  readonly handleRenameTask: () => void
  readonly handleSessionsSashDoubleClick: () => void
  readonly handleSessionsSashPointerDown: (
    clientX: number,
    containerWidth: number,
    containerLeft: number,
    sessionsLeft: number,
    sessionsWidth: number,
  ) => void
  readonly handleSessionsSashPointerMove: (clientX: number) => void
  readonly handleSessionsSashPointerUp: () => void
  readonly handleTaskClick: (
    name: unknown,
    button: unknown,
    detail: unknown,
  ) => Promise<void>
  readonly handleTaskMouseDown: (
    name: unknown,
    button: unknown,
  ) => Promise<void>
  readonly handleTitleMenuClick: (x: unknown, y: unknown) => Promise<void>
  readonly newChat: (requestRerender?: boolean) => Promise<void>
  readonly openQuickPickItem: (id: string) => Promise<void>
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
  readonly toggleSessionsList: (requestRerender?: boolean) => Promise<void>
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
    const items = await getFileHandles(fileIds)
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
const titleMenuId = 'chat2.title'
const maxTaskTitleLength = 80
const fileLineHash = /^#L(\d+)$/u
const pathSeparatorRegex = /[\\/]/
const localImagePathRegex =
  /^(?:file:\/\/|\/|~\/|[a-z]:[\\/]).+\.(?:avif|bmp|gif|jpe?g|png|webp)$/i
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
  const endedAt = isWorking(task) ? Date.now() : Date.parse(task.updatedAt)
  return Math.max(0, Math.floor((endedAt - getWorkingStartedAt(task)) / 1000))
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
    const href = await getHref(execute)
    const url = getUrl(href)
    if (!url) {
      return
    }
    let hash = ''
    if (taskId) {
      hash = isChatPath(url.pathname)
        ? getChatTaskHash(taskId)
        : `#chat-${encodeURIComponent(taskId)}`
    }
    await execute('Layout.setHash', hash)
  } catch {
    // Older editor builds do not expose the hash command.
  }
}

const setWorkbenchLayoutUrl = async (
  execute: ExecuteCommand,
  layout: 'ide' | 'ai-native',
  taskId?: string,
): Promise<void> => {
  try {
    const href = await getHref(execute)
    const url = getUrl(href)
    if (!url) {
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      await execute(
        'Layout.setHash',
        layout === 'ai-native' && taskId
          ? `#chat-${encodeURIComponent(taskId)}`
          : '',
      )
      return
    }
    const wasChatPath = isChatPath(url.pathname)
    if (layout === 'ai-native') {
      const assetDir = await execute('Layout.getAssetDir')
      if (typeof assetDir !== 'string' || !assetDir) {
        return
      }
      url.pathname = getChatPath(href, assetDir)
      url.hash = taskId ? getChatTaskHash(taskId) : ''
    } else {
      url.pathname = getIdePath(href)
      if (wasChatPath) {
        url.hash = ''
      }
    }
    await execute(
      'Layout.setPathName',
      `${url.pathname}${url.search}${url.hash}`,
    )
  } catch {
    // Older editor builds do not expose pathname updates.
  }
}

const thinkingModes = new Set(['low', 'medium', 'high'])

const isThinkingMode = (value: string): value is 'low' | 'medium' | 'high' =>
  thinkingModes.has(value)

const activeInstances = new Set<ActiveChatViewInstance>()
const activeInstanceState: { instance: ActiveChatViewInstance | undefined } = {
  instance: undefined,
}

const getPreferredModelId = async (): Promise<string> => {
  try {
    const value = await getPreference('chat2.selectedModelId')
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

const getPreferredThinkingMode = async (): Promise<
  'low' | 'medium' | 'high'
> => {
  try {
    const value = await getPreference('chat2.selectedThinkingMode')
    return value === 'low' || value === 'high' ? value : 'medium'
  } catch {
    return 'medium'
  }
}

const getActiveInstance = (): ActiveChatViewInstance | undefined => {
  return (
    activeInstanceState.instance || activeInstances.values().toArray().at(-1)
  )
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
    oldConfiguration.useMockBackend === newConfiguration.useMockBackend &&
    oldConfiguration.accessToken === newConfiguration.accessToken &&
    oldConfiguration.loginRequired === newConfiguration.loginRequired &&
    oldConfiguration.openAiWebSearch === newConfiguration.openAiWebSearch &&
    oldConfiguration.titleModelId === newConfiguration.titleModelId &&
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

export const toggleActiveChatViewSessionsList = async (): Promise<void> => {
  await getActiveInstance()?.toggleSessionsList(true)
}

export const getActiveChatQuickPickItems = (): readonly {
  readonly id: string
  readonly title: string
}[] => {
  return getActiveInstance()?.getQuickPickItems() ?? []
}

export const openActiveChatQuickPickItem = async (
  id: unknown,
): Promise<void> => {
  if (typeof id !== 'string' || !id) {
    return
  }
  await getActiveInstance()?.openQuickPickItem(id)
}

const activeRuns = new Map<string, AbortController>()
const runCompletions = new Map<string, Promise<void>>()

interface MathRenderCache {
  readonly pending: Map<string, Promise<void>>
  readonly rendered: Map<string, readonly VirtualDomNode[]>
}

interface RenderMathExpressionsOptions {
  readonly assetDirPromise: Promise<unknown>
  readonly cache: Readonly<MathRenderCache>
  readonly expressions: readonly Readonly<MathExpression>[]
  readonly onRendered: () => Promise<void>
  readonly onStylesheetLoaded: (stylesheet: string) => void
}

const renderMathExpressions = async (
  // The options object has readonly fields; the lint rule cannot infer that through the callback fields.
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  options: RenderMathExpressionsOptions,
): Promise<void> => {
  const {
    assetDirPromise,
    cache,
    expressions,
    onRendered,
    onStylesheetLoaded,
  } = options
  const chatMath = await import('./ChatMath.ts')
  const assetDir = await assetDirPromise
  if (typeof assetDir === 'string' && assetDir) {
    onStylesheetLoaded(await chatMath.getMathStylesheet(assetDir))
  }
  const newMathRequests: Promise<void>[] = []
  for (const { displayMode, source } of expressions) {
    const key = chatMath.getMathKey(source, displayMode)
    if (cache.rendered.has(key) || cache.pending.has(key)) {
      continue
    }
    const promise = chatMath
      .renderMath(source, displayMode)
      .then((nodes) => {
        cache.rendered.set(key, nodes)
      })
      .finally(() => {
        cache.pending.delete(key)
      })
    cache.pending.set(key, promise)
    newMathRequests.push(promise)
  }
  if (newMathRequests.length === 0) {
    return
  }
  await Promise.all(newMathRequests)
  await onRendered()
}

export const createInstance = async (
  context?: ViewContext,
  providedApi?: ChatApi,
  readPreference?: ReadPreference,
  execute: ExecuteCommand = executeCommand,
  defaultApiHost: DefaultChatApiHost = defaultChatApiHost,
  imageTransferHost: ImageTransferHost = defaultImageTransferHost,
  writeClipboardText: (text: string) => Promise<void> = writeClipboardTextApi,
  writePreference: typeof setPreference = setPreference,
): Promise<ActiveChatViewInstance> => {
  const imageCache = createChatImageCache()
  let pendingWorkbenchLayout: 'ide' | 'ai-native' | undefined
  let authenticationRejected = false
  let currentState: MutableChatViewState | undefined
  const mathRenderCache: MathRenderCache = {
    pending: new Map(),
    rendered: new Map(),
  }
  let mathStylesheet = ''
  let mathAssetDirPromise: Promise<unknown> | undefined
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
  const assistantMessageFontFamily = await readMessageFontFamily(
    assistantMessageFontFamilyPreference,
    defaultAssistantMessageFontFamily,
    readPreference,
  )
  const userMessageFontFamily = await readMessageFontFamily(
    userMessageFontFamilyPreference,
    defaultUserMessageFontFamily,
    readPreference,
  )
  const fontSize = await readFontSize(readPreference)
  const aiNativeTheme = await readAiNativeTheme(readPreference)
  const taskOpenMode = await readTaskOpenMode(readPreference)
  const selectedModelId = getSelectedModelId(models, preferredModelId)
  const savedThinkingMode = await getPreferredThinkingMode()
  const selectedThinkingMode = models
    .find((model) => model.id === selectedModelId)
    ?.thinkingModes?.includes(savedThinkingMode)
    ? savedThinkingMode
    : 'medium'
  let followUpBehavior: 'queue' | 'steer' = 'queue'
  try {
    const value = await (readPreference || getPreference)(
      'chat2.followUpBehavior',
    )
    if (value === 'steer') followUpBehavior = value
  } catch {
    // Queue safely when preferences are unavailable.
  }
  let thinkingModeEnabled = true
  try {
    thinkingModeEnabled =
      (await (readPreference
        ? readPreference('chat2.thinkingModeEnabled')
        : getPreference('chat2.thinkingModeEnabled'))) !== false
  } catch {
    // Keep the selector available when preferences are unavailable.
  }
  const href = await getHref(execute)
  const chatRoute = URL.canParse(href) && isChatPath(new URL(href).pathname)
  const chatHash = parseChatTaskHash(href)
  const urlTask =
    chatHash.type === 'task'
      ? await api.getTask(chatHash.id).catch(() => undefined)
      : undefined
  let selectedTask =
    urlTask ||
    (saved.selectedTaskId
      ? await api.getTask(saved.selectedTaskId).catch(() => undefined)
      : undefined)
  const resolveTaskImages = async (task: ChatTask): Promise<ChatTask> => ({
    ...task,
    events: await Promise.all(
      task.events.map(async (event) => {
        if (event.type === 'assistant-message' && event.images?.length) {
          return {
            ...event,
            images: await Promise.all(event.images.map(imageCache.resolve)),
          }
        }
        if (event.type === 'user-message' && event.attachments?.length) {
          return {
            ...event,
            attachments: await Promise.all(
              event.attachments.map(imageCache.resolve),
            ),
          }
        }
        return event
      }),
    ),
  })
  const [resolvedTasks, resolvedSelectedTask] = await Promise.all([
    Promise.all(tasks.map(resolveTaskImages)),
    selectedTask ? resolveTaskImages(selectedTask) : Promise.resolve(undefined),
  ])
  selectedTask = resolvedSelectedTask
  if (chatHash.type === 'invalid') {
    await setChatTaskHash(execute)
  }
  const focusModeEnabled = chatRoute || (await getFocusModeEnabled())
  pendingWorkbenchLayout = chatRoute ? 'ai-native' : undefined
  const draftWorkspace = await getWorkspaceUri().catch(() => '')
  const storedDraft = await readDraft(draftWorkspace, selectedTask?.id)
  const state: MutableChatViewState = {
    activityExpanded: false,
    aiNativeTheme,
    assistantMessageFontFamily,
    changesExpanded: false,
    composerFocused: false,
    composerImages: [],
    copiedCodeId: '',
    copiedMessageId: '',
    draft: storedDraft ?? (typeof saved.draft === 'string' ? saved.draft : ''),
    errorMessage,
    focusMode: chatRoute || (focusModeEnabled && (await getFocusMode())),
    focusModeEnabled,
    followUpBehavior,
    fontFamily,
    fontSize,
    loginPending: false,
    loginRequired:
      authenticationRejected || backendConfiguration?.loginRequired === true,
    modelPickerOpen: false,
    models,
    selectedModelId,
    selectedTask,
    selectedThinkingMode,
    sessionsListVisible: true,
    sessionsVisible: false,
    taskOpenMode,
    tasks: resolvedTasks,
    thinkingModeEnabled,
    thinkingModePickerOpen: false,
    userMessageFontFamily,
    workingSeconds:
      selectedTask && isWorking(selectedTask)
        ? getWorkingSeconds(selectedTask)
        : 0,
  }
  const saveDraft = (): Promise<void> =>
    writeDraft(draftWorkspace, state.selectedTask?.id, state.draft)
  let selectedTaskRequest = 0
  let focusComposerRequest = false
  let preserveComposerValue = false
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
      ? `${state.selectedTask?.title || defaultChatTitle} - Lvce Editor`
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
  const pendingStarts = new Map<number, symbol>()
  let authStatePoll: ReturnType<typeof setInterval> | undefined
  let authStateSyncing = false
  let copyFeedbackTimeout: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let taskRefreshRequest = 0
  let stateResolutionRequest = 0
  let taskRefreshTimeout: ReturnType<typeof setTimeout> | undefined
  const taskChangeChannel =
    typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel(taskStoreChannelName)
  let contextMenuTaskId: string | undefined
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
          const attachment = await imageCache.resolve(
            await loadImageAttachment(file),
          )
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
    if (!task) {
      stopWorkingTimer()
      state.workingSeconds = 0
      return
    }
    state.workingSeconds = getWorkingSeconds(task)
    if (!isWorking(task)) {
      stopWorkingTimer()
      return
    }
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
    state.copiedCodeId = ''
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

  const showCodeCopyFeedback = (codeId: string): void => {
    resetCopyFeedback()
    state.copiedCodeId = codeId
    copyFeedbackTimeout = setTimeout(() => {
      copyFeedbackTimeout = undefined
      state.copiedCodeId = ''
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
      activeRuns.size > 0 ||
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
      state.statusPopup = undefined
      state.selectedModelId = getSelectedModelId(
        nextModels,
        state.selectedModelId,
      )
      if (
        !nextModels
          .find((model) => model.id === state.selectedModelId)
          ?.thinkingModes?.includes(state.selectedThinkingMode)
      ) {
        state.selectedThinkingMode = 'medium'
      }
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
    await saveDraft()
    taskRefreshRequest++
    selectedTaskRequest++
    resetCopyFeedback()
    state.statusPopup = undefined
    state.selectedTask = undefined
    await setChatTaskHash(execute)
    state.draft = ''
    preserveComposerValue = false
    await saveDraft()
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
    const resolvedTask = await resolveTaskImages(task)
    if (disposed) {
      return
    }
    taskRefreshRequest++
    const taskChanged = state.selectedTask?.id !== resolvedTask.id
    state.selectedTask = resolvedTask
    if (taskChanged) {
      await setChatTaskHash(execute, resolvedTask.id)
    }
    syncWorkingTimer(resolvedTask)
    state.tasks = [
      resolvedTask,
      ...state.tasks.filter((item) => item.id !== resolvedTask.id),
    ].slice(0, 20)
    void syncWindowTitle().catch(() => {})
  }

  let openingTaskId: string | undefined
  const openTask = async (id: string): Promise<void> => {
    if (state.selectedTask?.id === id || openingTaskId === id) {
      return
    }
    openingTaskId = id
    try {
      await saveDraft()
      const request = ++selectedTaskRequest
      resetCopyFeedback()
      const task = await api.getTask(id)
      if (disposed || request !== selectedTaskRequest) {
        return
      }
      state.statusPopup = undefined
      state.selectedTask = task
      scrollToLatestTurn = state.focusMode && Boolean(task)
      syncWorkingTimer(state.selectedTask)
      if (state.selectedTask) {
        state.selectedModelId = state.selectedTask.modelId
        if (
          !state.models
            .find((model) => model.id === state.selectedModelId)
            ?.thinkingModes?.includes(state.selectedThinkingMode)
        ) {
          state.selectedThinkingMode = 'medium'
        }
        await setChatTaskHash(execute, state.selectedTask.id)
      } else {
        await setChatTaskHash(execute)
      }
      state.draft = (await readDraft(draftWorkspace, task?.id)) || ''
      preserveComposerValue = false
      state.composerImages = []
      state.activityExpanded = false
      state.changesExpanded = false
      void syncWindowTitle().catch(() => {})
    } finally {
      if (openingTaskId === id) {
        openingTaskId = undefined
      }
    }
  }

  const updateTask = async (
    task: ChatTask,
    request = selectedTaskRequest,
  ): Promise<void> => {
    if (disposed) {
      return
    }
    if (request !== selectedTaskRequest && state.selectedTask?.id !== task.id) {
      taskRefreshRequest++
      const resolvedTask = await resolveTaskImages(task)
      if (disposed) {
        return
      }
      state.tasks = [
        resolvedTask,
        ...state.tasks.filter((item) => item.id !== resolvedTask.id),
      ].slice(0, 20)
      await context?.requestRerender()
      return
    }
    await setTask(task)
    await context?.requestRerender()
  }

  const refreshTasks = async (): Promise<void> => {
    const request = ++taskRefreshRequest
    const selectedTaskId = state.selectedTask?.id
    const selectedTaskRequestAtStart = selectedTaskRequest
    const [tasks, selectedTask] = await Promise.all([
      api.listTasks(20),
      selectedTaskId ? api.getTask(selectedTaskId) : Promise.resolve(undefined),
    ])
    if (disposed || request !== taskRefreshRequest) {
      return
    }
    state.tasks = await Promise.all(tasks.map(resolveTaskImages))
    if (
      selectedTaskId &&
      selectedTaskRequestAtStart === selectedTaskRequest &&
      state.selectedTask?.id === selectedTaskId
    ) {
      if (!selectedTask || selectedTask.archived) {
        archivedTaskIds.add(selectedTaskId)
        selectedTaskRequest++
        state.statusPopup = undefined
        state.selectedTask = undefined
        syncWorkingTimer(undefined)
        await setChatTaskHash(execute)
      } else {
        state.selectedTask = await resolveTaskImages(selectedTask)
        syncWorkingTimer(state.selectedTask)
      }
      void syncWindowTitle().catch(() => {})
    }
    await context?.requestRerender()
  }

  const showStatus = async (): Promise<void> => {
    const popup = {
      modelId: state.selectedModelId,
      phase: 'loading' as const,
      taskId: state.selectedTask?.id,
    }
    state.statusPopup = popup
    state.modelPickerOpen = false
    state.draft = ''
    preserveComposerValue = false
    focusComposerRequest = !focusComposerRequest
    await saveDraft()
    await context?.requestRerender()
    try {
      const allowance = await api.getAllowance?.(popup.modelId)
      if (disposed || state.statusPopup !== popup) return
      state.statusPopup = { ...popup, allowance, phase: 'ready' }
    } catch {
      if (disposed || state.statusPopup !== popup) return
      state.statusPopup = { ...popup, phase: 'error' }
    }
    await context?.requestRerender()
  }

  const submit = async (requestRerender = false): Promise<void> => {
    const message = state.draft.trim()
    if (message === '/status' && !state.loginRequired) {
      await showStatus()
      return
    }
    state.statusPopup = undefined
    const attachments = state.composerImages.flatMap((image) =>
      image.status === 'ready' && image.attachment
        ? [removeObjectUrl(image.attachment)]
        : [],
    )
    if (
      state.loginRequired ||
      (!message && attachments.length === 0) ||
      state.composerImages.some((image) => image.status !== 'ready') ||
      !state.selectedModelId
    ) {
      return
    }
    if (pendingStarts.has(selectedTaskRequest)) {
      return
    }
    const request = selectedTaskRequest
    // Reserve before draft persistence yields, and release only our own send.
    const reservation = Symbol()
    pendingStarts.set(request, reservation)
    const releaseReservation = (): void => {
      if (pendingStarts.get(request) === reservation) {
        pendingStarts.delete(request)
      }
    }
    const modelId = state.selectedModelId
    const initialTask = state.selectedTask
    const thinkingMode = state.selectedThinkingMode
    const submissionApi = api
    const controller = new AbortController()
    const completion = Promise.withResolvers<void>()
    const previousCompletion = initialTask && runCompletions.get(initialTask.id)
    if (initialTask && isWorking(initialTask) && !previousCompletion) {
      releaseReservation()
      throw new Error('This conversation is running in another window.')
    }
    let runningTaskId: string | undefined
    const queuedMessage =
      initialTask && previousCompletion
        ? {
            event: createEvent({
              attachments: state.composerImages.flatMap((image) =>
                image.attachment ? [image.attachment] : [],
              ),
              text: message,
              type: 'user-message',
            }),
            taskId: initialTask.id,
          }
        : undefined
    if (queuedMessage) {
      state.queuedMessages = [...(state.queuedMessages || []), queuedMessage]
      // Each follow-up owns a place in the chain before persistence yields.
      runningTaskId = queuedMessage.taskId
      runCompletions.set(runningTaskId, completion.promise)
      if (followUpBehavior === 'steer') activeRuns.get(runningTaskId)?.abort()
    }
    try {
      if (state.focusMode) {
        scrollToLatestTurn = true
      }
      state.draft = ''
      preserveComposerValue = false
      state.composerImages = []
      state.modelPickerOpen = false
      await saveDraft()
      if (queuedMessage) {
        releaseReservation()
        await context?.requestRerender()
      }
      if (previousCompletion) await previousCompletion
      if (disposed || (initialTask && archivedTaskIds.has(initialTask.id)))
        return
      const latestTask =
        initialTask &&
        (state.tasks.find((task) => task.id === initialTask.id) || initialTask)
      const selectedTask = latestTask ? { ...latestTask, modelId } : undefined
      if (queuedMessage) {
        state.queuedMessages = (state.queuedMessages || []).filter(
          (item) => item !== queuedMessage,
        )
      }
      runningTaskId = selectedTask?.id
      if (runningTaskId) {
        activeRuns.set(runningTaskId, controller)
        if (!runCompletions.has(runningTaskId))
          runCompletions.set(runningTaskId, completion.promise)
      }
      const options = {
        attachments,
        ...(state.models
          .find((model) => model.id === modelId)
          ?.thinkingModes?.includes(thinkingMode) && {
          thinkingMode,
        }),
        onUpdate: (task: ChatTask): Promise<void> => {
          runningTaskId = task.id
          if (task.status === 'idle' || isWorking(task)) {
            activeRuns.set(task.id, controller)
            if (!runCompletions.has(task.id))
              runCompletions.set(task.id, completion.promise)
          }
          if (task.status !== 'idle') {
            releaseReservation()
          }
          return updateTask(task, request)
        },
        signal: controller.signal,
      }
      const task = selectedTask
        ? await submissionApi.sendMessage(
            removeObjectUrls(selectedTask),
            message,
            options,
          )
        : await submissionApi.createTask(message, modelId, options)
      await updateTask(task, request)
      if (requestRerender) {
        await context?.requestRerender()
      }
    } finally {
      if (queuedMessage)
        state.queuedMessages = (state.queuedMessages || []).filter(
          (item) => item !== queuedMessage,
        )
      releaseReservation()
      if (runningTaskId && activeRuns.get(runningTaskId) === controller) {
        activeRuns.delete(runningTaskId)
      }
      if (
        runningTaskId &&
        runCompletions.get(runningTaskId) === completion.promise
      ) {
        runCompletions.delete(runningTaskId)
      }
      completion.resolve()
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
    await setWorkbenchLayoutUrl(
      execute,
      pendingWorkbenchLayout,
      state.selectedTask?.id,
    )
    await syncWindowTitle()
    if (requestRerender) {
      await context?.requestRerender()
    }
  }

  const handleToggleSessionsList = async (
    requestRerender = false,
  ): Promise<void> => {
    state.sessionsListVisible = !state.sessionsListVisible
    if (requestRerender) {
      await context?.requestRerender()
    }
  }

  const renameTask = async (): Promise<void> => {
    const id = contextMenuTaskId
    contextMenuTaskId = undefined
    if (!id) {
      return
    }
    const task =
      state.tasks.find((item) => item.id === id) ||
      (state.selectedTask?.id === id ? state.selectedTask : undefined)
    if (!task) {
      return
    }
    const value = await execute('ExtensionHostQuickPick.showQuickInput', {
      placeholder: 'Enter a chat name',
      value: task.title,
    })
    if (typeof value !== 'string') {
      return
    }
    const title = value.trim()
    if (!title || title.length > maxTaskTitleLength) {
      return
    }
    const renamedTask = await api.renameTask(id, title)
    if (!renamedTask || disposed) {
      return
    }
    state.tasks = state.tasks.some((item) => item.id === id)
      ? state.tasks.map((item) => (item.id === id ? renamedTask : item))
      : [renamedTask, ...state.tasks].slice(0, 20)
    if (state.selectedTask?.id === id) {
      state.selectedTask = renamedTask
      void syncWindowTitle().catch(() => {})
    }
    await context?.requestRerender()
  }

  const handleRenameTask = (): void => {
    void renameTask().catch(async (error: unknown) => {
      if (disposed) {
        return
      }
      state.errorMessage =
        error instanceof Error ? error.message : String(error)
      try {
        await context?.requestRerender()
      } catch {
        // The event response already renders the error state.
      }
    })
  }

  const handleTitleMenuClick = async (
    x: unknown,
    y: unknown,
  ): Promise<void> => {
    const { selectedTask } = state
    if (!selectedTask) {
      return
    }
    contextMenuTaskId = selectedTask.id
    await context?.showContextMenu(
      titleMenuId,
      typeof x === 'number' && Number.isFinite(x) ? x : 0,
      typeof y === 'number' && Number.isFinite(y) ? y : 0,
    )
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
      imageCache.dispose()
      taskChangeChannel?.close()
      if (taskRefreshTimeout !== undefined) {
        clearTimeout(taskRefreshTimeout)
        taskRefreshTimeout = undefined
      }
      if (state.focusMode) {
        void syncWindowTitle().catch(() => {})
      }
      currentState = undefined
      if (authStatePoll !== undefined) {
        clearInterval(authStatePoll)
        authStatePoll = undefined
      }
      resetCopyFeedback()
      stopWorkingTimer()
      activeInstances.delete(instance)
      if (activeInstanceState.instance === instance) {
        activeInstanceState.instance = undefined
      }
    },
    getContext(): Readonly<Record<string, boolean>> {
      return {
        'chat2.composerFocus': state.composerFocused,
        'chat2.focusComposerRequest': focusComposerRequest,
        'chat2.focusMode': state.focusMode,
        'chat2.taskRunning': state.selectedTask?.status === 'running',
      }
    },
    getCss(): string {
      return renderCss(state)
    },
    getMenuEntries(menuId: string): readonly MenuEntry[] {
      if (menuId !== titleMenuId || !state.selectedTask) {
        return []
      }
      contextMenuTaskId ??= state.selectedTask.id
      return [
        {
          args: [context?.uid, 'handleViewCommand', 'handleRenameTask'],
          command: 'Viewlet.executeViewletCommand',
          flags: 6,
          id: 'rename-chat',
          label: 'Rename',
        },
      ]
    },
    getQuickPickItems() {
      return state.tasks
        .filter((task) => !archivedTaskIds.has(task.id))
        .map(({ id, title }) => ({ id, title }))
    },
    getState(): Readonly<ChatViewState> {
      return state
    },
    handleDragOver(): void {},
    async handleEvent(event: Readonly<ViewEvent>): Promise<void> {
      if (event.type === 'contextmenu') {
        if (
          state.selectedTask &&
          typeof event.x === 'number' &&
          Number.isFinite(event.x) &&
          typeof event.y === 'number' &&
          Number.isFinite(event.y)
        ) {
          contextMenuTaskId = state.selectedTask.id
          await context?.showContextMenu(titleMenuId, event.x, event.y)
        }
        return
      }
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
      if (event.type === 'click' && event.name?.startsWith('open-image:')) {
        const [, eventId, indexValue] = event.name.split(':')
        const message = state.selectedTask?.events.find(
          (item) => item.id === eventId,
        )
        const index = Number(indexValue)
        let image
        if (message?.type === 'user-message') {
          image = message.attachments?.[index]
        } else if (message?.type === 'assistant-message') {
          image = message.images?.[index]
        }
        if (image) {
          state.imagePreview = image
          await context?.requestRerender()
        }
        return
      }
      if (
        event.type === 'click' &&
        (event.name === 'close-image-preview' ||
          event.name === 'image-preview-overlay')
      ) {
        state.imagePreview = undefined
        await context?.requestRerender()
        return
      }
      if (state.loginRequired) {
        return
      }
      if (event.type === 'input' && event.name === 'composer') {
        state.composerFocused = true
        activeInstanceState.instance = instance
        // Native input can advance while earlier worker renders are still queued.
        // Do not send stale value patches back to the textarea.
        state.draft = getEventString(event)
        preserveComposerValue = true
        await saveDraft()
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
        activeInstanceState.instance = instance
        return
      }
      if (event.type === 'blur' && event.name === 'composer') {
        state.composerFocused = false
        return
      }
      if (event.type === 'blur' && event.name === undefined) {
        state.modelPickerOpen = false
        return
      }
      if (event.type !== 'click') {
        return
      }
      if (event.name?.startsWith('open-file:')) {
        try {
          const workspace = state.selectedTask?.workspaceUri
          if (!workspace) {
            throw new Error('This conversation has no associated workspace.')
          }
          const base = workspace.endsWith('/') ? workspace : `${workspace}/`
          const destination = decodeURIComponent(
            event.name.slice('open-file:'.length),
          )
          const target = URL.parse(destination, base)
          if (!target) {
            throw new Error('Invalid file source link.')
          }
          const line = fileLineHash.exec(target.hash)
          target.hash = ''
          getWorkspaceRelativePath(base, target.href)
          if (state.focusMode) {
            await handleToggleFocusMode()
          }
          await execute('Main.openUri', target.href)
          if (line) {
            const row = Math.max(0, Number(line[1]) - 1)
            await execute('GetActiveEditor.setSelections', [row, 0, row, 0])
          }
        } catch (error) {
          state.errorMessage =
            error instanceof Error ? error.message : String(error)
        }
        return
      }
      if (event.name === 'close-status') {
        state.statusPopup = undefined
        focusComposerRequest = !focusComposerRequest
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
      if (event.name === 'toggle-sessions') {
        state.sessionsVisible = !state.sessionsVisible
        return
      }
      if (event.name === 'stop') {
        if (state.selectedTask && !activeRuns.has(state.selectedTask.id)) {
          state.errorMessage =
            'Stop this conversation in the window where it is running.'
          return
        }
        if (state.selectedTask?.status === 'running') {
          await setTask(setStatus(state.selectedTask, 'stopping'))
        }
        if (state.selectedTask) {
          activeRuns.get(state.selectedTask.id)?.abort()
        }
        return
      }
      if (event.name === 'back' || event.name === 'new-task') {
        await newChat()
        return
      }
      if (event.name === 'model-picker') {
        state.statusPopup = undefined
        state.modelPickerOpen = !state.modelPickerOpen
        state.thinkingModePickerOpen = false
        return
      }
      if (event.name === 'thinking-mode-picker') {
        state.modelPickerOpen = false
        state.thinkingModePickerOpen = !state.thinkingModePickerOpen
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
          await setTask(
            await api.revertTask(removeObjectUrls(state.selectedTask)),
          )
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
          try {
            await writeClipboardText(message.text)
          } catch (error) {
            state.errorMessage = `Unable to copy message: ${error instanceof Error ? error.message : String(error)}`
            return
          }
          showCopyFeedback(message.id)
        }
        return
      }
      if (event.name?.startsWith('copy-code:') && state.selectedTask) {
        const payload = event.name.slice('copy-code:'.length)
        const separatorIndex = payload.lastIndexOf(':')
        const messageId = payload.slice(0, separatorIndex)
        const blockIndexText = payload.slice(separatorIndex + 1)
        const blockIndex = Number(blockIndexText)
        if (!Number.isSafeInteger(blockIndex) || blockIndex < 0) {
          return
        }
        const message = state.selectedTask.events.find(
          (item) =>
            item.id === messageId &&
            (item.type === 'assistant-message' || item.type === 'user-message'),
        )
        let messageText: string | undefined
        if (
          message?.type === 'assistant-message' ||
          message?.type === 'user-message'
        ) {
          messageText = message.text
        } else if (messageId === `streaming:${state.selectedTask.id}`) {
          messageText = state.selectedTask.streamingText
        }
        const code =
          messageText === undefined
            ? undefined
            : getCodeBlockText(messageText, blockIndex)
        if (code === undefined) {
          return
        }
        try {
          await writeClipboardText(code)
        } catch (error) {
          state.errorMessage = `Unable to copy code: ${error instanceof Error ? error.message : String(error)}`
          return
        }
        showCodeCopyFeedback(`${messageId}:${blockIndex}`)
        return
      }
      if (event.name?.startsWith('archive-task:')) {
        const id = event.name.slice('archive-task:'.length)
        if (state.tasks.every((task) => task.id !== id)) {
          return
        }
        try {
          await api.archiveTask(id)
          taskRefreshRequest++
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
          state.statusPopup = undefined
          state.selectedModelId = id
          if (!model.thinkingModes?.includes(state.selectedThinkingMode)) {
            state.selectedThinkingMode = 'medium'
          }
          state.modelPickerOpen = false
          state.thinkingModePickerOpen = false
          await writePreference('chat2.selectedModelId', id)
        }
      }
      if (event.name?.startsWith('thinking-mode:')) {
        const mode = event.name.slice('thinking-mode:'.length)
        const selectedModel = state.models.find(
          (item) => item.id === state.selectedModelId,
        )
        if (
          isThinkingMode(mode) &&
          selectedModel?.thinkingModes?.includes(mode)
        ) {
          state.selectedThinkingMode = mode
          state.thinkingModePickerOpen = false
          await writePreference('chat2.selectedThinkingMode', mode)
        }
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
    async handleImagePaste(
      fileIds: unknown,
      text?: unknown,
      selectionStart?: unknown,
      selectionEnd?: unknown,
    ): Promise<void> {
      if (Array.isArray(fileIds) && fileIds.length > 0) {
        if (fileIds.some((id) => typeof id !== 'number')) {
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
        return
      }
      if (typeof text !== 'string' || text.length === 0) {
        return
      }
      if (localImagePathRegex.test(text.trim())) {
        state.errorMessage =
          'This browser only provided the image file path. Copy the image itself or drag the image into the chat.'
        return
      }
      const start =
        typeof selectionStart === 'number'
          ? Math.max(0, Math.min(selectionStart, state.draft.length))
          : state.draft.length
      const end =
        typeof selectionEnd === 'number'
          ? Math.max(start, Math.min(selectionEnd, state.draft.length))
          : start
      state.draft = `${state.draft.slice(0, start)}${text}${state.draft.slice(end)}`
      preserveComposerValue = false
      await saveDraft()
      state.errorMessage = ''
      // The host renders after this event returns. Waiting for another render
      // here would queue it behind this handler and deadlock the view.
    },
    handleKeyDown(
      key: unknown,
      ctrlKey?: unknown,
      metaKey?: unknown,
      shiftKey?: unknown,
    ): void {
      const zoomCommand = getZoomCommand(key, ctrlKey, metaKey, shiftKey)
      if (zoomCommand) {
        // The host's Ctrl/Cmd minus binding already handles zoom out. Route
        // plus here because Electron does not dispatch that shifted chord.
        if (zoomCommand === 'Window.zoomIn') {
          void executeCommand(zoomCommand).catch(() => {})
        }
        return
      }
      if (key === 'Escape' && state.imagePreview) {
        state.imagePreview = undefined
        void context?.requestRerender()
        return
      }
      if (key === 'Escape' && state.statusPopup) {
        state.statusPopup = undefined
        focusComposerRequest = !focusComposerRequest
        void context?.requestRerender()
      }
      if (key === 'Escape' && state.modelPickerOpen) {
        state.modelPickerOpen = false
      }
      if (key === 'Escape' && state.thinkingModePickerOpen) {
        state.thinkingModePickerOpen = false
      }
    },
    handleModelPickerOutsideClick(name: unknown, value: unknown): void {
      if (name === 'composer' && typeof value === 'string') {
        state.draft = value
        preserveComposerValue = true
        void saveDraft().catch((error: unknown) => {
          state.errorMessage =
            error instanceof Error ? error.message : String(error)
          void context?.requestRerender()
        })
      }
      if (
        state.modelPickerOpen &&
        name !== 'model-picker' &&
        name !== 'model-picker-popup' &&
        !(typeof name === 'string' && name.startsWith('model:'))
      ) {
        state.modelPickerOpen = false
      }
      if (
        state.thinkingModePickerOpen &&
        name !== 'thinking-mode-picker' &&
        name !== 'thinking-mode-popup' &&
        !(typeof name === 'string' && name.startsWith('thinking-mode:'))
      ) {
        state.thinkingModePickerOpen = false
      }
    },
    handleRenameTask,
    handleSessionsSashDoubleClick(): void {
      sessionsSashDrag = undefined
      delete state.sessionsWidth
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
    async handleTaskClick(
      name: unknown,
      button: unknown,
      detail: unknown,
    ): Promise<void> {
      if (
        state.loginRequired ||
        typeof name !== 'string' ||
        !name.startsWith('task:') ||
        (button !== 0 && detail !== 0)
      ) {
        return
      }
      await openTask(name.slice('task:'.length))
    },
    async handleTaskMouseDown(name: unknown, button: unknown): Promise<void> {
      if (
        state.loginRequired ||
        state.taskOpenMode !== 'mousedown' ||
        (button !== 0 && button !== undefined) ||
        typeof name !== 'string' ||
        !name.startsWith('task:')
      ) {
        return
      }
      await openTask(name.slice('task:'.length))
    },
    handleTitleMenuClick,
    newChat,
    async openQuickPickItem(id: string): Promise<void> {
      await openTask(id)
    },
    render(): readonly VirtualDomNode[] {
      const { selectedTask } = state
      if (selectedTask) {
        const messages = selectedTask.events.flatMap((event) =>
          event.type === 'assistant-message' || event.type === 'user-message'
            ? [event.text]
            : [],
        )
        if (selectedTask.streamingText) {
          messages.push(selectedTask.streamingText)
        }
        const expressions = messages.flatMap(getMathExpressions)
        if (expressions.length > 0) {
          mathAssetDirPromise ??= (async (): Promise<string | undefined> => {
            const assetDir = await execute('Layout.getAssetDir')
            const href = await execute('Layout.getHref')
            if (typeof assetDir !== 'string' || typeof href !== 'string') {
              return undefined
            }
            const url = new URL(assetDir, href)
            while (url.pathname.endsWith('/')) {
              url.pathname = url.pathname.slice(0, -1)
            }
            url.pathname += '/'
            return url.href
          })()
          void renderMathExpressions({
            assetDirPromise: mathAssetDirPromise,
            cache: mathRenderCache,
            expressions,
            onRendered: async () => {
              if (!disposed && state.selectedTask?.id === selectedTask.id) {
                await context?.requestRerender()
              }
            },
            onStylesheetLoaded(stylesheet) {
              mathStylesheet = stylesheet
            },
          }).catch(() => {})
        }
      }
      imageCache.retain([
        ...state.tasks.flatMap(getTaskImages),
        ...(state.selectedTask ? getTaskImages(state.selectedTask) : []),
        ...state.composerImages.flatMap((image) =>
          image.attachment ? [image.attachment] : [],
        ),
        ...(state.imagePreview ? [state.imagePreview] : []),
      ])
      return render(
        { ...state, preserveComposerValue },
        mathRenderCache.rendered,
        mathStylesheet,
      )
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
      preserveComposerValue = false
      const resolutionRequest = ++stateResolutionRequest
      Object.assign(state, {
        ...newState,
        composerImages: newState.composerImages || [],
        selectedTask: newState.selectedTask,
      })
      const task = state.selectedTask
      const needsImageResolution =
        [...state.tasks, ...(task ? [task] : [])].some(
          hasUnresolvedTaskImages,
        ) || hasUnresolvedComposerImages(state.composerImages)
      if (!needsImageResolution) {
        syncWorkingTimer(state.selectedTask)
        return
      }
      void Promise.all([
        Promise.all(state.tasks.map(resolveTaskImages)),
        task ? resolveTaskImages(task) : Promise.resolve(undefined),
        Promise.all(
          state.composerImages.map(async (image) =>
            image.attachment
              ? {
                  ...image,
                  attachment: await imageCache.resolve(image.attachment),
                }
              : image,
          ),
        ),
      ]).then(
        async ([resolvedTasks, resolvedTask, resolvedComposerImages]: readonly [
          readonly ChatTask[],
          ChatTask | undefined,
          readonly ChatComposerImage[],
        ]) => {
          if (
            disposed ||
            resolutionRequest !== stateResolutionRequest ||
            state.selectedTask?.id !== task?.id
          ) {
            return
          }
          state.tasks = resolvedTasks
          state.selectedTask = resolvedTask
          state.composerImages = resolvedComposerImages
          await context?.requestRerender()
        },
      )
      syncWorkingTimer(state.selectedTask)
    },
    submit,
    toggleFocusMode: handleToggleFocusMode,
    toggleSessionsList: handleToggleSessionsList,
  }
  syncWorkingTimer(selectedTask)
  void syncWindowTitle().catch(() => {})
  if (backendConfiguration?.baseUrl) {
    authStatePoll = setInterval(() => {
      void syncAuthState()
    }, authStatePollInterval)
  }
  if (taskChangeChannel) {
    const handleTaskRefreshError = (error: Readonly<unknown>): void => {
      if (disposed) {
        return
      }
      let message = 'Unable to refresh chat tasks'
      if (error instanceof Error || typeof error === 'string') {
        message = error instanceof Error ? error.message : error
      }
      state.errorMessage = message
      void context?.requestRerender()
    }
    taskChangeChannel.onmessage = (
      event: Readonly<{ data: Readonly<Record<string, unknown>> }>,
    ): void => {
      if (
        !event.data ||
        typeof event.data !== 'object' ||
        !('type' in event.data) ||
        event.data.type !== 'tasks-changed'
      ) {
        return
      }
      if (taskRefreshTimeout !== undefined) {
        return
      }
      taskRefreshTimeout = setTimeout(() => {
        taskRefreshTimeout = undefined
        void refreshTasks().catch(handleTaskRefreshError)
      }, 25)
    }
  }
  activeInstances.add(instance)
  return instance
}
