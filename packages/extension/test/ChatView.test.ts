// cspell:words nemotron
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { ViewContext, ViewEvent } from '@lvce-editor/api'
import { expect, jest, test } from '@jest/globals'
import { VirtualDomElements } from '@lvce-editor/virtual-dom-worker'
import type { BackendConfiguration } from '../src/parts/BackendConfiguration/BackendConfiguration.ts'
import type { ChatTask } from '../src/parts/ChatApi/ChatApi.ts'
import { createEvent } from '../src/parts/ChatTask/ChatTask.ts'
import { view } from '../src/parts/ChatView/ChatView.ts'
import { createInstance } from '../src/parts/ChatView/CreateInstance.ts'
import {
  createMockChatApi,
  mockResponse,
} from '../src/parts/MockChatApi/MockChatApi.ts'

const getText = (dom: readonly any[]): string => {
  return dom
    .filter((node) => typeof node.text === 'string')
    .map((node) => node.text)
    .join('\n')
}

const getNodesByClass = (
  dom: readonly any[],
  className: string,
): readonly any[] => {
  return dom.filter((node) => node.className?.split(' ').includes(className))
}

const getPathByClass = (
  dom: readonly any[],
  className: string,
): readonly number[] | undefined => {
  let index = 0
  const visit = (path: readonly number[]): readonly number[] | undefined => {
    const node = dom[index++]
    if (node.className?.split(' ').includes(className)) {
      return path
    }
    for (let childIndex = 0; childIndex < node.childCount; childIndex++) {
      const childPath = visit([...path, childIndex])
      if (childPath) {
        return childPath
      }
    }
    return undefined
  }
  return visit([])
}

const dispatch = async (
  instance: Awaited<ReturnType<typeof createInstance>>,
  event: ViewEvent,
): Promise<void> => {
  await instance.handleEvent?.(event)
}

const createTestInstance = async (
  delayMs = 0,
  readPreference?: (key: string) => Promise<unknown>,
  imageTransferHost?: {
    readonly discardDrop: (dropId: number) => Promise<void>
    readonly getClipboardFiles: (
      fileIds: readonly number[],
    ) => Promise<readonly File[]>
    readonly getDroppedFiles: (dropId: number) => Promise<readonly File[]>
  },
) => {
  return createInstance(
    undefined,
    createMockChatApi(delayMs),
    readPreference,
    undefined,
    undefined,
    imageTransferHost,
  )
}

const createViewContext = (state: unknown): ViewContext => ({
  async requestRerender() {},
  async showContextMenu() {},
  state,
  uid: 1,
  viewId: 'chat2.views.chat',
})

test('renders a focused task list, model control, and composer', async () => {
  const instance = await createTestInstance()
  const dom = instance.render() as readonly any[]

  expect(getNodesByClass(dom, 'ChatTaskButton')).toHaveLength(20)
  expect(getNodesByClass(dom, 'ChatTaskArchiveButton')).toHaveLength(20)
  expect(dom).toContainEqual(
    expect.objectContaining({
      ariaLabel: 'Archive Add worker memory usage',
      className: 'ChatTaskArchiveButton',
      name: 'archive-task:mock-task-1',
      title: 'Archive',
    }),
  )
  expect(dom).toContainEqual(
    expect.objectContaining({
      className: 'ChatComposerInput',
      name: 'composer',
      placeholder: 'Describe a programming task',
      rows: 1,
    }),
  )
  const inputContainerIndex = dom.findIndex(
    (node) => node.className === 'ChatComposerInputContainer',
  )
  expect(dom[inputContainerIndex]).toEqual(
    expect.objectContaining({
      childCount: 1,
      className: 'ChatComposerInputContainer',
      type: VirtualDomElements.Div,
    }),
  )
  expect(dom[inputContainerIndex + 1]).toEqual(
    expect.objectContaining({ className: 'ChatComposerInput' }),
  )
  expect(dom).toContainEqual(
    expect.objectContaining({
      className: 'ChatModelButton',
      name: 'model-picker',
    }),
  )
  expect(dom).toContainEqual(
    expect.objectContaining({
      ariaLabel: 'Send message',
      className: 'ChatSubmitButton',
      name: 'submit',
    }),
  )
  expect(getText(dom)).toContain('↑')

  const spacerIndex = dom.findIndex(
    (node) => node.className === 'ChatComposerSpacer',
  )
  const modelIndex = dom.findIndex((node) => node.name === 'model-picker')
  const submitIndex = dom.findIndex((node) => node.name === 'submit')
  expect(spacerIndex).toBeLessThan(modelIndex)
  expect(modelIndex).toBeLessThan(submitIndex)
})

test('renders a Sessions sash and resizes the panel with bounded pointer movement', async () => {
  const instance = await createTestInstance()
  instance.setState({ ...instance.getState(), focusMode: true })
  const sash = getNodesByClass(instance.render(), 'ChatSessionsSash')[0]

  expect(sash).toEqual(
    expect.objectContaining({
      ariaLabel: 'Resize sessions panel',
      ariaOrientation: 'vertical',
      onPointerDown: 'handleSessionsSashPointerDown',
      role: 'separator',
    }),
  )
  expect(view.eventListeners).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'handleSessionsSashPointerDown',
        trackPointerEvents: [
          'handleSessionsSashPointerMove',
          'handleSessionsSashPointerUp',
        ],
      }),
    ]),
  )

  instance.handleSessionsSashPointerDown(400, 1000, 100, 100, 280)
  instance.handleSessionsSashPointerMove(450)
  expect(instance.getState().sessionsWidth).toBe(330)
  expect(instance.render()).toContainEqual(
    expect.objectContaining({ style: '--ChatSessionsWidth: 330px' }),
  )
  instance.handleSessionsSashPointerMove(2000)
  expect(instance.getState().sessionsWidth).toBe(680)
  instance.handleSessionsSashPointerUp()
  instance.handleSessionsSashPointerMove(100)
  expect(instance.getState().sessionsWidth).toBe(680)

  instance.handleSessionsSashPointerDown(400, 1000, 100, 820, 280)
  instance.handleSessionsSashPointerMove(450)
  expect(instance.getState().sessionsWidth).toBe(230)
})

test('keeps scrolling to the bottom for the ordinary chat layout', async () => {
  const instance = await createTestInstance()

  expect(instance.renderScrollPosition()).toEqual(['.ChatMessages', 9_999_999])
})

test('scrolls to the latest AI-native turn once after each submission', async () => {
  const instance = await createTestInstance()
  instance.setState({ ...instance.getState(), draft: 'First', focusMode: true })

  await instance.submit()

  expect(getNodesByClass(instance.render(), 'ChatTurnLatest')).toHaveLength(1)
  expect(instance.renderScrollPosition()).toEqual(['.ChatMessages', 9_999_999])
  expect(instance.renderScrollPosition()).toEqual([])

  instance.setState({ ...instance.getState(), draft: 'Follow-up' })
  await instance.submit()

  expect(instance.renderScrollPosition()).toEqual(['.ChatMessages', 9_999_999])
  expect(instance.renderScrollPosition()).toEqual([])
})

test('shows loading feedback and blocks submission until images finish loading', async () => {
  const instance = await createTestInstance()
  instance.setState({
    ...instance.getState(),
    composerImages: [{ id: 'image-1', name: 'sample.png', status: 'loading' }],
    draft: 'Describe this',
  })

  expect(
    getNodesByClass(instance.render(), 'ChatComposerImage-loading'),
  ).toHaveLength(1)
  expect(getText(instance.render())).toContain('Loading image…')
  await instance.submit()

  expect(instance.getState().draft).toBe('Describe this')
  expect(instance.getState().selectedTask).toBeUndefined()
})

test('submits image attachments and keeps a small preview in the message history', async () => {
  const instance = await createTestInstance()
  const attachment = {
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    mimeType: 'image/png',
    name: 'sample.png',
  }
  instance.setState({
    ...instance.getState(),
    composerImages: [
      { attachment, id: 'image-1', name: 'sample.png', status: 'ready' },
    ],
    draft: 'Describe this',
  })

  await instance.submit()

  expect(instance.getState().selectedTask?.events).toContainEqual(
    expect.objectContaining({
      attachments: [attachment],
      text: 'Describe this',
      type: 'user-message',
    }),
  )
  expect(instance.render()).toContainEqual(
    expect.objectContaining({
      alt: 'sample.png',
      className: 'ChatMessageImage',
      src: attachment.dataUrl,
    }),
  )
})

test('loads pasted image files once and submits the decoded image bytes', async () => {
  const imageBytes = Promise.withResolvers<ArrayBuffer>()
  const file = {
    arrayBuffer: () => imageBytes.promise,
    name: 'pasted.png',
    type: 'image/png',
  } as File
  const imageTransferHost = {
    async discardDrop() {},
    async getClipboardFiles() {
      return [file]
    },
    async getDroppedFiles() {
      return []
    },
  }
  const instance = await createTestInstance(0, undefined, imageTransferHost)
  instance.setState({ ...instance.getState(), draft: 'Read the pasted image' })

  const loading = instance.handleImagePaste([1])
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(instance.getState().composerImages[0]?.status).toBe('loading')
  await instance.submit()
  expect(instance.getState().selectedTask).toBeUndefined()

  imageBytes.resolve(new TextEncoder().encode('hello').buffer)
  await loading
  expect(instance.getState().composerImages[0]?.status).toBe('ready')
  await instance.submit()

  expect(
    instance
      .getState()
      .selectedTask?.events.find((event) => event.type === 'user-message'),
  ).toEqual(
    expect.objectContaining({
      attachments: [
        {
          dataUrl: 'data:image/png;base64,aGVsbG8=',
          mimeType: 'image/png',
          name: 'pasted.png',
        },
      ],
    }),
  )
})

test('reads dropped image data and releases its drop session', async () => {
  const file = {
    arrayBuffer: async () => new TextEncoder().encode('drop').buffer,
    name: 'dropped.png',
    type: 'image/png',
  } as File
  const discardDrop = jest.fn(async (_dropId: number) => {})
  const getDroppedFiles = jest.fn(async (_dropId: number) => [file])
  const instance = await createTestInstance(0, undefined, {
    discardDrop,
    async getClipboardFiles() {
      return []
    },
    getDroppedFiles,
  })

  await instance.handleImageDrop(42)

  expect(getDroppedFiles).toHaveBeenCalledWith(42)
  expect(discardDrop).toHaveBeenCalledWith(42)
  expect(instance.getState().composerImages[0]).toEqual(
    expect.objectContaining({
      attachment: expect.objectContaining({
        dataUrl: 'data:image/png;base64,ZHJvcA==',
        mimeType: 'image/png',
      }),
      status: 'ready',
    }),
  )
})

test('saves and restores the composer draft through view state', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Keep this draft across reloads',
  })

  const restoredInstance = await createInstance(
    createViewContext(instance.saveState?.()),
    createMockChatApi(),
  )

  expect(restoredInstance.getState().draft).toBe(
    'Keep this draft across reloads',
  )
  expect(restoredInstance.render()).toContainEqual(
    expect.objectContaining({
      className: 'ChatComposerInput',
      value: 'Keep this draft across reloads',
    }),
  )
})

test('restores the URL task before the previously saved task', async () => {
  const execute = jest.fn(
    async (command: string, ..._args: readonly unknown[]) => {
      return command === 'Layout.getHref'
        ? 'https://example.com/static/?workspace=project#chat-mock-task-2'
        : undefined
    },
  )
  const instance = await createInstance(
    createViewContext({ selectedTaskId: 'mock-task-1' }),
    createMockChatApi(),
    undefined,
    execute,
  )

  expect(instance.getState().selectedTask?.id).toBe('mock-task-2')
  expect(execute).toHaveBeenCalledWith('Layout.getHref')
})

test('restores a copied chat URL when the view has no saved state', async () => {
  const execute = jest.fn(
    async (command: string, ..._args: readonly unknown[]) => {
      return command === 'Layout.getHref'
        ? 'https://example.com/static/?workspace=project#chat-mock-task-2'
        : undefined
    },
  )
  const instance = await createInstance(
    undefined,
    createMockChatApi(),
    undefined,
    execute,
  )

  expect(instance.getState().selectedTask?.id).toBe('mock-task-2')
  expect(execute).toHaveBeenCalledWith('Layout.getHref')
})

test('AI-native browser title includes the editor name and restores the workspace title', async () => {
  const execute = jest.fn(
    async (command: string, ..._args: readonly unknown[]) => {
      if (command === 'Workspace.getPath') {
        return '/workspace/my-project'
      }
      return command === 'Layout.getSideBarFocusMode'
    },
  )
  const instance = await createInstance(
    undefined,
    createMockChatApi(),
    undefined,
    execute,
  )
  const state = instance.getState() as {
    focusMode: boolean
    focusModeEnabled: boolean
  }
  state.focusModeEnabled = true
  state.focusMode = true

  try {
    await dispatch(instance, { name: 'task:mock-task-2', type: 'click' })
    expect(execute).toHaveBeenCalledWith(
      'WindowTitle.set',
      'Fix quickpick beforeinput crash - Lvce Editor',
    )

    await instance.newChat()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(execute).toHaveBeenCalledWith(
      'WindowTitle.set',
      'Chat 2 - Lvce Editor',
    )

    await instance.toggleFocusMode()
    expect(execute).toHaveBeenCalledWith('WindowTitle.set', 'my-project')
  } finally {
    instance.dispose?.()
  }
})

test('falls back to the saved task when the URL task no longer exists', async () => {
  const api = createMockChatApi()
  const execute = jest.fn(
    async (command: string, ..._args: readonly unknown[]) => {
      return command === 'Layout.getHref'
        ? 'https://example.com/static/#chat-deleted-task'
        : undefined
    },
  )
  const instance = await createInstance(
    createViewContext({ selectedTaskId: 'mock-task-1' }),
    api,
    undefined,
    execute,
  )

  expect(instance.getState().selectedTask?.id).toBe('mock-task-1')
  expect(execute).not.toHaveBeenCalledWith('Layout.setHash', '')
})

test('clears malformed chat fragments while restoring the saved task', async () => {
  const execute = jest.fn(
    async (command: string, ..._args: readonly unknown[]) => {
      return command === 'Layout.getHref'
        ? 'https://example.com/static/#chat-%E0%A4%A'
        : undefined
    },
  )
  const instance = await createInstance(
    createViewContext({ selectedTaskId: 'mock-task-1' }),
    createMockChatApi(),
    undefined,
    execute,
  )

  expect(instance.getState().selectedTask?.id).toBe('mock-task-1')
  expect(execute).toHaveBeenCalledWith('Layout.setHash', '')
})

test('syncs selected and cleared tasks to the URL fragment', async () => {
  const execute = jest.fn(
    async (_command: string, ..._args: readonly unknown[]) => undefined,
  )
  const instance = await createInstance(
    undefined,
    createMockChatApi(),
    undefined,
    execute,
  )

  await dispatch(instance, {
    name: 'task:mock-task-2',
    type: 'click',
  })
  expect(execute).toHaveBeenLastCalledWith(
    'Layout.setHash',
    '#chat-mock-task-2',
  )

  await instance.newChat()
  expect(execute).toHaveBeenLastCalledWith('Layout.setHash', '')
})

test('exposes and applies live component state without replacing the chat instance', async () => {
  const instance = await createTestInstance()
  expect(view).toEqual(
    expect.objectContaining({
      getComponentState: expect.any(Function),
      setComponentState: expect.any(Function),
    }),
  )
  const currentState = instance.getState()
  const newState = { ...currentState, draft: 'Edit the live state' }

  instance.setState(newState)

  expect(instance.getState()).toEqual(
    expect.objectContaining({ draft: 'Edit the live state' }),
  )
  expect(instance.render()).toContainEqual(
    expect.objectContaining({
      className: 'ChatComposerInput',
      value: 'Edit the live state',
    }),
  )
})

test('rejects invalid live component state without changing the chat', async () => {
  const instance = await createTestInstance()
  const originalState = instance.getState()

  expect(() => instance.setState({ ...originalState, draft: 42 })).toThrow(
    'Chat 2 state must be a valid state object',
  )
  expect(instance.getState()).toBe(originalState)
  expect(instance.getState().draft).toBe('')
})

test('shows a clear error when chat models cannot be loaded', async () => {
  const api = {
    ...createMockChatApi(),
    async listModels() {
      throw new TypeError('Failed to fetch')
    },
  }

  const instance = await createInstance(undefined, api)
  const dom = instance.render() as readonly any[]

  expect(instance.getState().errorMessage).toBe(
    'Chat Models could not be loaded from server',
  )
  expect(getText(dom)).toContain('Chat Models could not be loaded from server')
  expect(getText(dom)).not.toContain('Failed to fetch')
})

test('shows the model loading error provided by the backend', async () => {
  const api = {
    ...createMockChatApi(),
    async listModels() {
      throw new Error('Log in to access the chat.')
    },
  }

  const instance = await createInstance(undefined, api)
  const dom = instance.render() as readonly any[]

  expect(instance.getState().errorMessage).toBe('Log in to access the chat.')
  expect(getText(dom)).toContain('Log in to access the chat.')
})

test('keeps failed token refreshes in the login state without unauthenticated requests or retries', async () => {
  jest.useFakeTimers()
  const configuration: BackendConfiguration = {
    accessToken: '',
    baseUrl: 'https://backend.example.com',
    loginRequired: true,
    supportsStreaming: true,
  }
  const listModels = jest.fn(createMockChatApi().listModels)
  const listTasks = jest.fn(createMockChatApi().listTasks)
  const resolveConfiguration = jest.fn(async () => configuration)
  const instance = await createInstance(
    createViewContext(undefined),
    undefined,
    undefined,
    undefined,
    {
      async createApi() {
        return { ...createMockChatApi(), listModels, listTasks }
      },
      resolveConfiguration,
    },
  )

  try {
    expect(instance.getState()).toEqual(
      expect.objectContaining({
        errorMessage: '',
        loginRequired: true,
        models: [],
        tasks: [],
      }),
    )
    expect(getNodesByClass(instance.render(), 'ChatLoginButton')).toHaveLength(
      1,
    )
    expect(listModels).not.toHaveBeenCalled()
    expect(listTasks).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(1000)

    expect(resolveConfiguration).toHaveBeenCalledTimes(1)
  } finally {
    instance.dispose?.()
    jest.useRealTimers()
  }
})

test('reloads models when authentication changes after the view loads', async () => {
  jest.useFakeTimers()
  const requestRerender = jest.fn(async () => {})
  const context = {
    ...createViewContext(undefined),
    requestRerender,
  }
  let configuration: BackendConfiguration = {
    accessToken: '',
    baseUrl: 'https://backend.example.com',
    supportsStreaming: true,
  }
  const loggedOutApi = {
    ...createMockChatApi(),
    async listModels() {
      throw new Error('Log in to access the chat.')
    },
  }
  const loggedInApi = createMockChatApi()
  const defaultApiHost = {
    async createApi() {
      return configuration.accessToken ? loggedInApi : loggedOutApi
    },
    async resolveConfiguration() {
      return configuration
    },
  }
  let instance: Awaited<ReturnType<typeof createInstance>> | undefined

  try {
    instance = await createInstance(
      context,
      undefined,
      undefined,
      undefined,
      defaultApiHost,
    )
    expect(instance.getState().errorMessage).toBe('Log in to access the chat.')
    expect(instance.getState().models).toEqual([])

    configuration = {
      ...configuration,
      accessToken: 'token-that-arrived-later',
    }
    await jest.advanceTimersByTimeAsync(500)

    expect(instance.getState().errorMessage).toBe('')
    expect(instance.getState().models).toHaveLength(5)
    expect(instance.getState().selectedModelId).toBe('gpt-5.4')
    expect(requestRerender).toHaveBeenCalledTimes(1)

    configuration = {
      ...configuration,
      accessToken: '',
    }
    await jest.advanceTimersByTimeAsync(500)

    expect(instance.getState().errorMessage).toBe('Log in to access the chat.')
    expect(instance.getState().models).toEqual([])
    expect(instance.getState().selectedModelId).toBe('')
    expect(requestRerender).toHaveBeenCalledTimes(2)
  } finally {
    instance?.dispose?.()
    jest.useRealTimers()
  }
})

test('archives a task from the task list', async () => {
  const instance = await createTestInstance()

  await dispatch(instance, {
    name: 'archive-task:mock-task-1',
    type: 'click',
  })

  expect(instance.getState().tasks).toHaveLength(19)
  expect(instance.getState().tasks.map((task) => task.id)).not.toContain(
    'mock-task-1',
  )
  expect(
    getNodesByClass(instance.render(), 'ChatTaskArchiveButton'),
  ).toHaveLength(19)
})

test('renders the experimental focus mode control when enabled', async () => {
  const instance = await createTestInstance()
  const state = instance.getState() as {
    focusMode: boolean
    focusModeEnabled: boolean
  }
  state.focusModeEnabled = true

  expect(instance.render()).toContainEqual(
    expect.objectContaining({
      className: 'ChatFocusModeButton',
      name: 'toggle-focus-mode',
      title: 'Focus entirely on chat',
    }),
  )

  state.focusMode = true
  const focusedDom = instance.render()
  expect(focusedDom[0]).toEqual(
    expect.objectContaining({
      className: 'ChatView ChatAiNativeLayout',
    }),
  )
  expect(getNodesByClass(focusedDom, 'ChatConversationBody')).toHaveLength(1)
  expect(getNodesByClass(focusedDom, 'ChatEmptyTitle')).toHaveLength(1)
  expect(getNodesByClass(focusedDom, 'ChatFocusModeButton')).toHaveLength(0)
  expect(getNodesByClass(focusedDom, 'ChatNewTaskButton')).toHaveLength(1)
})

test('keeps the AI-native composer in place after the first message', async () => {
  const instance = await createTestInstance()
  const state = instance.getState() as { focusMode: boolean }
  state.focusMode = true
  const emptyPath = getPathByClass(instance.render(), 'ChatComposer')

  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'A centered first message',
  })
  await instance.submit()

  const submittedPath = getPathByClass(instance.render(), 'ChatComposer')
  expect(submittedPath).toEqual(emptyPath)
  expect(instance.getContext()['chat2.composerFocus']).toBe(true)
})

test('uses the configured task list font size', async () => {
  const instance = await createTestInstance(0, async (key) => {
    return key === 'chat2.fontSize' ? ' 20px ' : undefined
  })

  expect(instance.getState().fontSize).toBe('20px')
  expect(instance.render()).toContainEqual(
    expect.objectContaining({
      className: 'ChatTaskList',
      style: '--ChatTaskFontFamily: inherit; --ChatTaskFontSize: 20px',
    }),
  )
})

test.each([undefined, 20, '', '-2px', 'calc(20px)', '20px; color: red'])(
  'falls back for invalid task list font size %p',
  async (fontSize) => {
    const instance = await createTestInstance(0, async (key) => {
      return key === 'chat2.fontSize' ? fontSize : undefined
    })

    expect(instance.getState().fontSize).toBe('13px')
    expect(instance.render()).toContainEqual(
      expect.objectContaining({
        className: 'ChatTaskList',
        style: '--ChatTaskFontFamily: inherit; --ChatTaskFontSize: 13px',
      }),
    )
  },
)

test('falls back when the task list font size cannot be read', async () => {
  const instance = await createTestInstance(0, async (key) => {
    if (key === 'chat2.fontSize') {
      throw new Error('preferences unavailable')
    }
  })

  expect(instance.getState().fontSize).toBe('13px')
})

test('uses the configured task list font family', async () => {
  const instance = await createTestInstance(0, async (key) => {
    return key === 'chat2.fontFamily' ? ' "Fira Code", monospace ' : undefined
  })

  expect(instance.getState().fontFamily).toBe('"Fira Code", monospace')
  expect(instance.render()).toContainEqual(
    expect.objectContaining({
      className: 'ChatTaskList',
      style:
        '--ChatTaskFontFamily: "Fira Code", monospace; --ChatTaskFontSize: 13px',
    }),
  )
})

test.each([undefined, 20, '', 'Arial; color: red', 'Arial\nmonospace'])(
  'falls back for invalid task list font family %p',
  async (fontFamily) => {
    const instance = await createTestInstance(0, async (key) => {
      return key === 'chat2.fontFamily' ? fontFamily : undefined
    })

    expect(instance.getState().fontFamily).toBe('inherit')
    expect(instance.render()).toContainEqual(
      expect.objectContaining({
        className: 'ChatTaskList',
        style: '--ChatTaskFontFamily: inherit; --ChatTaskFontSize: 13px',
      }),
    )
  },
)

test('falls back when the task list font family cannot be read', async () => {
  const instance = await createTestInstance(0, async (key) => {
    if (key === 'chat2.fontFamily') {
      throw new Error('preferences unavailable')
    }
  })

  expect(instance.getState().fontFamily).toBe('inherit')
})

test('submits a task and shows a Codex-style changed-files summary', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Build a smaller chat view',
  })
  await instance.submit()

  const dom = instance.render() as readonly any[]
  expect(getNodesByClass(dom, 'ChatDetailView')).toHaveLength(1)
  expect(getNodesByClass(dom, 'ChatMessageUser')).toHaveLength(1)
  expect(getNodesByClass(dom, 'ChatMessageAssistant')).toHaveLength(1)
  expect(getNodesByClass(dom, 'ChatMessageAuthor')).toHaveLength(0)
  expect(getText(dom)).toContain('Build a smaller chat view')
  expect(getText(dom)).toContain(mockResponse)
  expect(getText(dom)).toContain('Edited 5 files')
  expect(getText(dom)).toContain('+51')
  expect(getText(dom)).toContain('-10')
  expect(getText(dom)).toContain('✓ 2 checks passed')
  expect(getText(dom)).toContain('Undo ↩')
  expect(getText(dom)).toContain('Review')
  expect(getNodesByClass(dom, 'ChatChangedFile')).toHaveLength(3)
  expect(getText(dom)).toContain('Show 2 more files  ⌄')
  expect(
    dom.findIndex((node) => node.className === 'ChatChanges'),
  ).toBeLessThan(dom.findIndex((node) => node.className === 'ChatComposerArea'))
  expect(instance.renderTitle()).toBe('Chat 2: Build a smaller chat view')
  expect(instance.getState().draft).toBe('')
})

test('renders message urls as external links and preserves punctuation', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Inspect https://example.com/docs?q=chat.',
  })
  await instance.submit()

  const dom = instance.render() as readonly any[]
  expect(dom).toContainEqual({
    childCount: 1,
    className: 'ChatMessageLink',
    href: 'https://example.com/docs?q=chat',
    rel: 'noopener noreferrer',
    target: '_blank',
    title: 'https://example.com/docs?q=chat',
    type: VirtualDomElements.A,
  })
  expect(getText(dom)).toContain('Inspect \nhttps://example.com/docs?q=chat\n.')
})

test('renders Markdown tables in messages while keeping malformed streaming text literal', async () => {
  const timestamp = '2026-09-10T12:00:00.000Z'
  const countries = [
    'India',
    'China',
    'United States',
    'Indonesia',
    'Pakistan',
    'Nigeria',
    'Brazil',
    'Bangladesh',
    'Russia',
    'Ethiopia',
    'Mexico',
    'Japan',
    'Egypt',
    'Philippines',
    'Democratic Republic of the Congo',
    'Vietnam',
    'Iran',
    'Turkey',
    'Germany',
    'Thailand',
  ]
  const table = [
    '| Country | Population |',
    '| :--- | ---: |',
    ...countries.map((country, index) => {
      const countryText = index === 0 ? '**India**' : country
      const population =
        index === 1 ? 'https://example.com' : `${index + 1} million`
      return `| ${countryText} | ${population} |`
    }),
  ].join('\n')
  const task: ChatTask = {
    createdAt: timestamp,
    events: [
      createEvent({ text: 'Show the country table', type: 'user-message' }),
      createEvent({
        text: `Before the table.\n\n${table}\n\nMalformed:\n| Only | Header |\n| --- | --- |\n\nAfter the table with <img src=x onerror=alert(1)>`,
        type: 'assistant-message',
      }),
    ],
    id: 'table-task',
    modelId: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    status: 'running',
    streamingText: '| Partial | Header |\n| --- | :---: |\n| Streaming | row |',
    title: 'Show the country table',
    updatedAt: timestamp,
  }
  const instance = await createInstance(
    createViewContext({ selectedTaskId: task.id }),
    {
      ...createMockChatApi(),
      async getTask() {
        return task
      },
    },
  )
  try {
    const dom = instance.render() as readonly any[]
    const tableNodes = getNodesByClass(dom, 'ChatMessageTable')
    expect(tableNodes).toHaveLength(2)
    expect(getNodesByClass(dom, 'ChatMessageTableContainer')).toHaveLength(2)
    expect(getNodesByClass(dom, 'ChatMessageStreaming')).toHaveLength(1)
    expect(
      dom.filter((node) => node.type === VirtualDomElements.Th),
    ).toHaveLength(4)
    expect(
      dom.filter((node) => node.type === VirtualDomElements.Td),
    ).toHaveLength(42)
    expect(dom).toContainEqual(
      expect.objectContaining({
        className: 'ChatMessageTableCell ChatMessageTableCell-left',
        scope: 'col',
        type: VirtualDomElements.Th,
      }),
    )
    expect(dom).toContainEqual(
      expect.objectContaining({
        className: 'ChatMessageTableCell ChatMessageTableCell-right',
        type: VirtualDomElements.Td,
      }),
    )
    expect(dom).toContainEqual(
      expect.objectContaining({
        className: 'ChatMessageTableCell ChatMessageTableCell-center',
        type: VirtualDomElements.Th,
      }),
    )
    expect(getNodesByClass(dom, 'ChatMessageLink')).toHaveLength(1)
    expect(
      dom.filter((node) => node.type === VirtualDomElements.Strong),
    ).toHaveLength(1)
    expect(getText(dom)).toContain('Before the table.')
    expect(getText(dom)).toContain(
      'After the table with <img src=x onerror=alert(1)>',
    )
    expect(getText(dom)).toContain(
      'Malformed:\n| Only | Header |\n| --- | --- |',
    )
    expect(getText(dom)).toContain('Streaming')
    expect(
      dom.filter((node) => node.type === VirtualDomElements.Img),
    ).toHaveLength(0)
    expect(getNodesByClass(dom, 'ChatMessageTable')).toHaveLength(2)
  } finally {
    instance.dispose?.()
  }
})

test('renders fenced JSON as safe highlighted code in messages and streaming text', async () => {
  const timestamp = '2026-09-10T12:00:00.000Z'
  const task: ChatTask = {
    createdAt: timestamp,
    events: [
      createEvent({ text: 'Show an example', type: 'user-message' }),
      createEvent({
        text: 'Before **bold**\n```json\n{"jsonrpc":"2.0","method":"add","params":[2,3],"id":1}\n```\nAfter https://example.com\n```js\nconst sample = \'<img src=x onerror=alert(1)>\'\n```\n```\nplain code\n```',
        type: 'assistant-message',
      }),
    ],
    id: 'code-block-task',
    modelId: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    status: 'completed',
    streamingText: 'Partial\n```json\n{"ok":true',
    title: 'Show an example',
    updatedAt: timestamp,
  }
  const instance = await createInstance(
    createViewContext({ selectedTaskId: task.id }),
    {
      ...createMockChatApi(),
      async getTask() {
        return task
      },
    },
  )
  try {
    const dom = instance.render() as readonly any[]
    expect(getNodesByClass(dom, 'ChatCodeBlock')).toHaveLength(4)
    expect(getNodesByClass(dom, 'ChatCodeTokenKey')).toHaveLength(5)
    expect(getNodesByClass(dom, 'ChatCodeTokenString')).toHaveLength(2)
    expect(getNodesByClass(dom, 'ChatCodeTokenNumber')).toHaveLength(3)
    expect(getNodesByClass(dom, 'ChatCodeTokenLiteral')).toHaveLength(1)
    expect(getNodesByClass(dom, 'ChatMessageLink')).toHaveLength(1)
    expect(getText(dom)).toContain('"jsonrpc"')
    expect(getText(dom)).toContain('"ok"')
    expect(getText(dom)).toContain('<img src=x onerror=alert(1)>')
    expect(getText(dom)).toContain('plain code')
    expect(getText(dom)).not.toContain('```')
    expect(
      dom.filter((node) => node.type === VirtualDomElements.Img),
    ).toHaveLength(0)
    expect(
      dom.filter((node) => node.type === VirtualDomElements.Strong),
    ).toHaveLength(1)
  } finally {
    instance.dispose?.()
  }
})

test('expands the changed-file fixture for review', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Show all changed files',
  })
  await instance.submit()
  await dispatch(instance, { name: 'toggle-changes', type: 'click' })

  const dom = instance.render() as readonly any[]
  expect(getNodesByClass(dom, 'ChatChangedFile')).toHaveLength(5)
  expect(getText(dom)).toContain(
    'packages/e2e/src/chat2.virtual-dom-view.changed-files.ts',
  )
  expect(getText(dom)).not.toContain('Show 2 more files  ⌄')
})

test('renders user message actions and shows feedback after copying', async () => {
  const execute = jest.fn<
    (id: string, ...args: readonly unknown[]) => Promise<unknown>
  >(async () => undefined)
  const instance = await createInstance(
    undefined,
    createMockChatApi(),
    undefined,
    execute,
  )
  await dispatch(instance, { name: 'task:mock-task-1', type: 'click' })

  const dom = instance.render() as readonly any[]
  expect(getNodesByClass(dom, 'ChatMessageMetadata')).toHaveLength(1)
  expect(getNodesByClass(dom, 'ChatMessageTimestamp')).toHaveLength(1)
  expect(getNodesByClass(dom, 'ChatMessageCopyButton')).toHaveLength(1)
  const copyButton = getNodesByClass(dom, 'ChatMessageCopyButton')[0]
  expect(copyButton).toEqual(
    expect.objectContaining({
      ariaLabel: 'Copy message',
      title: 'Copy message',
    }),
  )

  await dispatch(instance, { name: copyButton.name, type: 'click' })

  expect(execute).toHaveBeenCalledWith(
    'ClipBoard.writeText',
    'Add worker memory usage',
  )
  const copiedButton = getNodesByClass(
    instance.render() as readonly any[],
    'ChatMessageCopyButton',
  )[0]
  expect(copiedButton).toEqual(
    expect.objectContaining({
      ariaLabel: 'Copied',
      className: 'ChatMessageCopyButton ChatMessageCopyButtonCopied',
      title: 'Copied',
    }),
  )
  instance.dispose?.()
})

test('opens the model picker without adding model controls to the header', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, { name: 'model-picker', type: 'click' })

  const dom = instance.render() as readonly any[]
  expect(getNodesByClass(dom, 'Chat2ModelPicker')).toHaveLength(1)
  expect(getText(dom)).toContain('Models')
  expect(getText(dom)).toContain('GPT-5.4')
})

test('closes the model picker on Escape without changing the model or draft', async () => {
  const instance = await createTestInstance()
  instance.setState({
    ...instance.getState(),
    draft: 'keep this draft',
    modelPickerOpen: true,
    selectedModelId: 'gpt-5.4',
  })

  instance.handleKeyDown('Enter')
  expect(instance.getState().modelPickerOpen).toBe(true)

  instance.handleKeyDown('Escape')
  expect(instance.getState().modelPickerOpen).toBe(false)
  expect(instance.getState().selectedModelId).toBe('gpt-5.4')
  expect(instance.getState().draft).toBe('keep this draft')
  expect(getNodesByClass(instance.render(), 'Chat2ModelPicker')).toHaveLength(0)

  instance.handleKeyDown('Escape')
  expect(instance.getState().modelPickerOpen).toBe(false)
  await dispatch(instance, { name: 'model-picker', type: 'click' })
  expect(instance.getState().modelPickerOpen).toBe(true)
  instance.dispose?.()
})

test('registers model picker keydown handling on the view root', async () => {
  const instance = await createTestInstance()

  expect(view.eventListeners).toContainEqual({
    name: 'handleKeyDown',
    params: ['handleKeyDown', 'event.key'],
  })
  expect(instance.render()[0]).toEqual(
    expect.objectContaining({ onKeyDown: 'handleKeyDown' }),
  )
  instance.dispose?.()
})

test('shows how many seconds an active task has been working', async () => {
  jest.useFakeTimers()
  jest.setSystemTime(Date.parse('2026-07-15T12:00:00.000Z'))
  const timestamp = new Date().toISOString()
  const runningTask: ChatTask = {
    createdAt: timestamp,
    events: [
      {
        id: 'event-running',
        status: 'running',
        timestamp,
        type: 'status',
      },
    ],
    id: 'running-task',
    modelId: 'gpt-5.4',
    status: 'running',
    title: 'Long task',
    updatedAt: timestamp,
  }
  const requestRerender = jest.fn(async () => {})
  const context = {
    ...createViewContext({ selectedTaskId: runningTask.id }),
    requestRerender,
  }
  const api = {
    ...createMockChatApi(),
    async getTask() {
      return runningTask
    },
  }
  let instance: Awaited<ReturnType<typeof createInstance>> | undefined

  try {
    instance = await createInstance(context, api)

    expect(getText(instance.render() as readonly any[])).toContain(
      'Working for 0 seconds',
    )

    await jest.advanceTimersByTimeAsync(2000)

    expect(getText(instance.render() as readonly any[])).toContain(
      'Working for 2 seconds',
    )
    expect(requestRerender).toHaveBeenCalledTimes(2)
  } finally {
    instance?.dispose?.()
    jest.useRealTimers()
  }
})

test('stops an active task', async () => {
  const instance = await createTestInstance(50)
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Long task',
  })
  const running = instance.submit()
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 0)
  await promise
  const runningDom = instance.render() as readonly any[]
  expect(runningDom).toContainEqual(
    expect.objectContaining({
      ariaLabel: 'Stop task',
      className: 'ChatSubmitButton',
      name: 'stop',
      title: 'Stop task',
    }),
  )
  expect(runningDom.some((node) => node.name === 'submit')).toBe(false)
  await dispatch(instance, { name: 'stop', type: 'click' })
  await running

  expect(instance.getState().selectedTask?.status).toBe('completed')
  expect(getText(instance.render() as readonly any[])).toContain('Stopped.')
  expect(instance.render()).toContainEqual(
    expect.objectContaining({
      ariaLabel: 'Send message',
      className: 'ChatSubmitButton',
      name: 'submit',
      title: 'Send message',
    }),
  )
})

test('does not submit an empty message', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: ' '.repeat(3),
  })
  await dispatch(instance, { name: 'submit', type: 'click' })

  expect(instance.getState().selectedTask).toBeUndefined()
})

test('opens a task, expands activity, and returns to the task list', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, { name: 'task:mock-task-1', type: 'click' })
  expect(instance.getState().selectedTask?.title).toBe(
    'Add worker memory usage',
  )

  await dispatch(instance, { name: 'toggle-activity', type: 'click' })
  expect(instance.getState().activityExpanded).toBe(true)
  await dispatch(instance, { name: 'back', type: 'click' })
  expect(instance.getState().selectedTask).toBeUndefined()
})

test('keeps the latest task selected when an older task refresh finishes later', async () => {
  const baseApi = createMockChatApi()
  const getTask = baseApi.getTask.bind(baseApi)
  const firstTask = await getTask('mock-task-1')
  const secondTask = await getTask('mock-task-2')
  if (!firstTask || !secondTask) {
    throw new Error('Expected mock tasks to be available')
  }
  const firstTaskRefresh = Promise.withResolvers<ChatTask>()
  const secondTaskRefresh = Promise.withResolvers<ChatTask>()
  const api = {
    ...baseApi,
    getTask: jest.fn((id: string) => {
      if (id === firstTask.id) {
        return firstTaskRefresh.promise
      }
      return secondTaskRefresh.promise
    }),
  }
  const instance = await createInstance(undefined, api)

  const firstSelection = dispatch(instance, {
    name: `task:${firstTask.id}`,
    type: 'click',
  })
  const secondSelection = dispatch(instance, {
    name: `task:${secondTask.id}`,
    type: 'click',
  })
  secondTaskRefresh.resolve(secondTask)
  await secondSelection
  firstTaskRefresh.resolve(firstTask)
  await firstSelection

  expect(instance.getState().selectedTask?.id).toBe(secondTask.id)
})

test('opens a new chat from the active task', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, { name: 'task:mock-task-1', type: 'click' })
  await dispatch(instance, { name: 'toggle-activity', type: 'click' })
  await dispatch(instance, { name: 'toggle-changes', type: 'click' })
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Discard this draft',
  })

  await instance.newChat()

  expect(instance.getState()).toEqual(
    expect.objectContaining({
      activityExpanded: false,
      changesExpanded: false,
      draft: '',
      selectedTask: undefined,
    }),
  )
  expect(instance.renderTitle()).toBe('Chat 2')
})

test('reopening a recovered task renders its answer without the previous error banner', async () => {
  const timestamp = '2026-09-10T12:00:00.000Z'
  const task: ChatTask = {
    createdAt: timestamp,
    events: [
      createEvent({
        message: 'Model request failed (502): Invalid response from OpenRouter',
        type: 'error',
      }),
      createEvent({ status: 'failed', type: 'status' }),
      createEvent({ text: '2+2', type: 'user-message' }),
      createEvent({ status: 'running', type: 'status' }),
      createEvent({
        text: '2+2 is **4**. Also **5**! Visit https://example.com.',
        type: 'assistant-message',
      }),
      createEvent({ status: 'completed', type: 'status' }),
    ],
    id: 'recovered-task',
    modelId: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    status: 'completed',
    streamingText: 'Streaming **bold** and unmatched **',
    title: '1+1',
    updatedAt: timestamp,
  }
  const instance = await createInstance(
    createViewContext({ selectedTaskId: task.id }),
    {
      ...createMockChatApi(),
      async getTask() {
        return task
      },
    },
  )
  try {
    const dom = instance.render() as readonly any[]
    expect(getText(dom)).toContain(
      '2+2 is \n4\n. Also \n5\n! Visit \nhttps://example.com\n.',
    )
    expect(getText(dom)).toContain('Streaming \nbold\n and unmatched **')
    expect(getNodesByClass(dom, 'ChatMessageLink')).toHaveLength(1)
    expect(
      dom.filter((node) => node.type === VirtualDomElements.Strong),
    ).toHaveLength(3)
    expect(getNodesByClass(dom, 'ChatErrorBanner')).toHaveLength(0)
  } finally {
    instance.dispose?.()
  }
})

test('renders only the login screen and replaces it after login, then hides chat on logout', async () => {
  jest.useFakeTimers()
  let configuration: BackendConfiguration = {
    accessToken: '',
    baseUrl: 'https://backend.example.com',
    loginRequired: true,
    supportsStreaming: true,
  }
  const execute = jest.fn(async (id: string) => {
    expect(id).toBe('Layout.signIn')
    configuration = {
      ...configuration,
      accessToken: 'token',
      loginRequired: false,
    }
  })
  const api = createMockChatApi()
  const listModels = jest.fn(api.listModels)
  const loginFinished = Promise.withResolvers<void>()
  const host = {
    async createApi() {
      return { ...api, listModels }
    },
    async resolveConfiguration() {
      return configuration
    },
  }
  const instance = await createInstance(
    {
      ...createViewContext(undefined),
      async requestRerender() {
        loginFinished.resolve()
      },
    },
    undefined,
    undefined,
    execute,
    host,
  )
  try {
    const dom = instance.render()
    expect(getNodesByClass(dom, 'ChatComposerInput')).toHaveLength(0)
    expect(getNodesByClass(dom, 'ChatTaskList')).toHaveLength(0)
    expect(getNodesByClass(dom, 'ChatModelButton')).toHaveLength(0)
    expect(getText(dom)).toContain('Log in to Chat 2')
    expect(getText(dom)).toContain('Login')
    expect(listModels).not.toHaveBeenCalled()
    await dispatch(instance, { name: 'login', type: 'click' })
    await loginFinished.promise
    expect(execute).toHaveBeenCalledWith('Layout.signIn')
    expect(
      getNodesByClass(instance.render(), 'ChatComposerInput'),
    ).toHaveLength(1)
    expect(getNodesByClass(instance.render(), 'ChatLoginButton')).toHaveLength(
      0,
    )
    configuration = { ...configuration, accessToken: '', loginRequired: true }
    await jest.advanceTimersByTimeAsync(500)
    expect(
      getNodesByClass(instance.render(), 'ChatComposerInput'),
    ).toHaveLength(0)
    expect(getNodesByClass(instance.render(), 'ChatLoginButton')).toHaveLength(
      1,
    )
  } finally {
    instance.dispose?.()
    jest.useRealTimers()
  }
})

test('keeps login available after a failed or cancelled login', async () => {
  const configuration: BackendConfiguration = {
    accessToken: '',
    baseUrl: 'https://backend.example.com',
    loginRequired: true,
    supportsStreaming: true,
  }
  const execute = jest.fn(async () => {
    throw new Error('Login cancelled')
  })
  const loginFinished = Promise.withResolvers<void>()
  const instance = await createInstance(
    {
      ...createViewContext(undefined),
      async requestRerender() {
        loginFinished.resolve()
      },
    },
    undefined,
    undefined,
    execute,
    {
      async createApi() {
        return createMockChatApi()
      },
      async resolveConfiguration() {
        return configuration
      },
    },
  )
  try {
    await dispatch(instance, { name: 'login', type: 'click' })
    await loginFinished.promise
    expect(getText(instance.render())).toContain('Login cancelled')
    expect(instance.getState().loginPending).toBe(false)
    expect(instance.getState().loginRequired).toBe(true)
    expect(
      getNodesByClass(instance.render(), 'ChatComposerInput'),
    ).toHaveLength(0)
  } finally {
    instance.dispose?.()
  }
})

test('starts login without awaiting a rerender queued behind the click event', async () => {
  const configuration: BackendConfiguration = {
    accessToken: '',
    baseUrl: 'https://backend.example.com',
    loginRequired: true,
    supportsStreaming: true,
  }
  const signInGate = Promise.withResolvers<void>()
  const rerenderGate = Promise.withResolvers<void>()
  const rerenderStarted = Promise.withResolvers<void>()
  let signInFinished = false
  const requestRerender = jest.fn(() => {
    if (signInFinished) {
      rerenderStarted.resolve()
    }
    return rerenderGate.promise
  })
  const execute = jest.fn(async (id: string) => {
    if (id === 'Layout.getHref') {
      return ''
    }
    expect(id).toBe('Layout.signIn')
    await signInGate.promise
    signInFinished = true
  })
  const instance = await createInstance(
    { ...createViewContext(undefined), requestRerender },
    undefined,
    undefined,
    execute,
    {
      async createApi() {
        return createMockChatApi()
      },
      async resolveConfiguration() {
        return configuration
      },
    },
  )
  try {
    await dispatch(instance, { name: 'login', type: 'click' })
    expect(execute).toHaveBeenCalledWith('Layout.signIn')
    expect(instance.getState().loginPending).toBe(true)
    expect(getNodesByClass(instance.render(), 'ChatLoginButton')[0]).toEqual(
      expect.objectContaining({ disabled: true }),
    )

    await dispatch(instance, { name: 'login', type: 'click' })
    expect(
      execute.mock.calls.flat().filter((id) => id === 'Layout.signIn'),
    ).toHaveLength(1)
    expect(requestRerender).not.toHaveBeenCalled()

    signInGate.resolve()
    await rerenderStarted.promise
    expect(instance.getState().loginPending).toBe(false)
    expect(requestRerender).toHaveBeenCalledTimes(1)
    rerenderGate.resolve()
  } finally {
    instance.dispose?.()
    signInGate.resolve()
    rerenderGate.resolve()
  }
})

test('releases the submit event before awaiting a queued rerender', async () => {
  const gate = Promise.withResolvers<void>()
  const completed = Promise.withResolvers<void>()
  const context = {
    ...createViewContext(undefined),
    requestRerender: async () => gate.promise,
  }
  const api = createMockChatApi(0)
  const instance = await createInstance(context, {
    ...api,
    async createTask(
      message,
      modelId,
      // AbortSignal is supplied by the view and forwarded unchanged.
      // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
      options: Parameters<typeof api.createTask>[2],
    ) {
      const task = await api.createTask(message, modelId, options)
      completed.resolve()
      return task
    },
  })
  await instance.handleEvent({
    name: 'composer',
    type: 'input',
    value: 'Test queued rendering',
  })
  const event = instance.handleEvent({ name: 'submit', type: 'click' })
  try {
    const released = await Promise.race([
      (async () => {
        await event
        return true
      })(),
      new Promise<boolean>((resolve) => setTimeout(resolve, 0, false)),
    ])
    expect(released).toBe(true)
  } finally {
    gate.resolve()
    await event
    await completed.promise
    instance.dispose?.()
  }
})

test('reports a background submit failure and allows retry', async () => {
  const rendered = Promise.withResolvers<void>()
  const api = createMockChatApi(0)
  const createTask = jest
    .fn<typeof api.createTask>()
    .mockRejectedValue(new Error('Request failed'))
  const instance = await createInstance(
    {
      ...createViewContext(undefined),
      async requestRerender() {
        rendered.resolve()
      },
    },
    { ...api, createTask },
  )
  try {
    await instance.handleEvent({
      name: 'composer',
      type: 'input',
      value: 'First',
    })
    await instance.handleEvent({ name: 'submit', type: 'click' })
    await rendered.promise
    expect(instance.getState().errorMessage).toBe('Request failed')
    await instance.handleEvent({
      name: 'composer',
      type: 'input',
      value: 'Retry',
    })
    await instance.handleEvent({ name: 'submit', type: 'click' })
    expect(createTask).toHaveBeenCalledTimes(2)
  } finally {
    instance.dispose?.()
  }
})

test.each(['models', 'request'])(
  'shows actionable Login after %s authentication recovery fails and stops polling',
  async (phase) => {
    jest.useFakeTimers()
    let rejectAuthentication: (() => void) | undefined
    let signedIn = false
    let loginStarted = false
    const configuration: BackendConfiguration = {
      accessToken: 'rejected-token',
      baseUrl: 'https://backend.example.com',
      supportsStreaming: true,
    }
    const resolveConfiguration = jest.fn(async () => configuration)
    const api = createMockChatApi(0)
    const loginFinished = Promise.withResolvers<void>()
    const instance = await createInstance(
      {
        ...createViewContext(undefined),
        async requestRerender() {
          if (loginStarted) {
            loginFinished.resolve()
          }
        },
      },
      undefined,
      undefined,
      async () => {
        signedIn = true
      },
      {
        async createApi(options) {
          rejectAuthentication = options.onLoginRequired
          return {
            ...api,
            async listModels() {
              if (phase === 'models' && !signedIn) {
                options.onLoginRequired?.()
                throw new Error('You must log in to continue.')
              }
              return api.listModels()
            },
          }
        },
        resolveConfiguration,
      },
    )
    try {
      if (phase === 'request') {
        rejectAuthentication?.()
      }
      expect(instance.getState().loginRequired).toBe(true)
      expect(
        getNodesByClass(instance.render(), 'ChatLoginButton'),
      ).toHaveLength(1)
      await jest.advanceTimersByTimeAsync(2000)
      expect(resolveConfiguration).toHaveBeenCalledTimes(1)
      loginStarted = true
      await dispatch(instance, { name: 'login', type: 'click' })
      await loginFinished.promise
      expect(instance.getState().loginRequired).toBe(false)
      expect(
        getNodesByClass(instance.render(), 'ChatComposerInput'),
      ).toHaveLength(1)
    } finally {
      instance.dispose?.()
      jest.useRealTimers()
    }
  },
)

test('AI-native view keeps sessions visible while changing the active conversation', async () => {
  const instance = await createTestInstance()
  const state = instance.getState() as { focusMode: boolean }
  state.focusMode = true
  expect(getNodesByClass(instance.render(), 'ChatSessions')).toHaveLength(1)
  await dispatch(instance, { name: 'task:mock-task-1', type: 'click' })
  expect(getNodesByClass(instance.render(), 'ChatTaskButton')).toHaveLength(20)
  expect(
    getNodesByClass(instance.render(), 'ChatFocusModeButton'),
  ).toHaveLength(0)
  expect(getNodesByClass(instance.render(), 'ChatNewTaskButton')).toHaveLength(
    1,
  )
  expect(getNodesByClass(instance.render(), 'ChatDetailHeader')).toHaveLength(1)
  expect(getNodesByClass(instance.render(), 'ChatMessages')).toHaveLength(1)
  expect(getText(instance.render())).toContain('Add worker memory usage')
  await dispatch(instance, { name: 'new-task', type: 'click' })
  expect(getNodesByClass(instance.render(), 'ChatSessions')).toHaveLength(1)
  expect(getNodesByClass(instance.render(), 'ChatComposer')).toHaveLength(1)
  instance.dispose?.()
})

test('focus toggles return matching view markup and layout metadata without committing layout early', async () => {
  let workbenchFocusMode = false
  const execute = jest.fn(async (id: string) => {
    return id === 'Layout.getSideBarFocusMode' ? workbenchFocusMode : undefined
  })
  const instance = await createInstance(
    undefined,
    createMockChatApi(),
    undefined,
    execute,
  )
  const state = instance.getState() as { focusModeEnabled: boolean }
  state.focusModeEnabled = true
  expect(instance.renderWorkbenchLayout()).toBeUndefined()

  await dispatch(instance, { name: 'toggle-focus-mode', type: 'click' })
  expect(instance.renderWorkbenchLayout()).toBe('ai-native')
  expect(instance.renderWorkbenchLayout()).toBeUndefined()
  expect(getNodesByClass(instance.render(), 'ChatAiNativeLayout')).toHaveLength(
    1,
  )
  workbenchFocusMode = true
  await instance.toggleFocusMode()
  expect(instance.renderWorkbenchLayout()).toBe('ide')
  expect(getNodesByClass(instance.render(), 'ChatAiNativeLayout')).toHaveLength(
    0,
  )
  expect(
    execute.mock.calls.some(
      (args: readonly [string]) =>
        args[0] === 'Layout.enterAiNativeLayout' ||
        args[0] === 'Layout.leaveSideBarFocusMode',
    ),
  ).toBe(false)
  instance.dispose?.()
})
