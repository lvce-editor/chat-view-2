// cspell:words nemotron
// cspell:ignore João Gonçalves Zarco
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { ViewContext, ViewEvent } from '@lvce-editor/api'
import { expect, jest, test } from '@jest/globals'
import { VirtualDomElements } from '@lvce-editor/virtual-dom-worker'
import type { BackendConfiguration } from '../src/parts/BackendConfiguration/BackendConfiguration.ts'
import type { ChatRunOptions, ChatTask } from '../src/parts/ChatApi/ChatApi.ts'
import { createEvent } from '../src/parts/ChatTask/ChatTask.ts'
import { view } from '../src/parts/ChatView/ChatView.ts'
import {
  createInstance,
  newChatInActiveChatViewInstance,
  submitActiveChatViewInstance,
} from '../src/parts/ChatView/CreateInstance.ts'
import {
  createMockChatApi,
  mockResponse,
} from '../src/parts/MockChatApi/MockChatApi.ts'
import { taskStoreChannelName } from '../src/parts/TaskStore/TaskStore.ts'

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
  if (event.type === 'click' && event.name?.startsWith('task:')) {
    await instance.handleTaskClick(event.name, 0, 1)
    return
  }
  await instance.handleEvent?.(event)
}

const dispatchTitleContextMenu = async (
  instance: Awaited<ReturnType<typeof createInstance>>,
): Promise<void> => {
  await dispatch(instance, {
    name: 'chat-title',
    type: 'contextmenu',
    x: 10,
    y: 20,
  })
}

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
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
  writePreference: (
    key: string,
    value: unknown,
  ) => Promise<void> = async () => {},
) => {
  return createInstance(
    undefined,
    createMockChatApi(delayMs),
    readPreference,
    undefined,
    undefined,
    imageTransferHost,
    undefined,
    writePreference,
  )
}

const createViewContext = (state: unknown): ViewContext => ({
  async requestRerender() {},
  async showContextMenu() {},
  state,
  uid: 1,
  viewId: 'chat2.views.chat',
})

test('reserves a pending submission before draft persistence can yield to another send', async () => {
  const api = createMockChatApi()
  const createTask = jest.spyOn(api, 'createTask')
  const sendMessage = jest.spyOn(api, 'sendMessage')
  const instance = await createInstance(undefined, api)
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'First request',
  })
  const first = instance.submit()
  const input = dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Keep this next draft',
  })
  const second = instance.submit()
  await Promise.all([first, input, second])
  expect(createTask.mock.calls.length + sendMessage.mock.calls.length).toBe(1)
  expect(instance.getState().draft).toBe('Keep this next draft')
  instance.dispose?.()
})

test('an older turn finishing cannot release a newer pending steering submission', async () => {
  const started = Promise.withResolvers<void>()
  const finish = Promise.withResolvers<void>()
  const steeringStarted = Promise.withResolvers<void>()
  const steeringFinished = Promise.withResolvers<void>()
  const api = createMockChatApi()
  jest
    .spyOn(api, 'createTask')
    .mockImplementation(
      async (
        message,
        modelId,
        options?: Readonly<Pick<ChatRunOptions, 'onUpdate'>>,
      ) => {
        const task: ChatTask = {
          createdAt: new Date().toISOString(),
          events: [createEvent({ text: message, type: 'user-message' })],
          id: 'pending-reservation-task',
          modelId,
          status: 'running',
          title: 'Pending reservation',
          updatedAt: new Date().toISOString(),
        }
        await options?.onUpdate?.(task)
        started.resolve()
        await finish.promise
        const completed = { ...task, status: 'completed' as const }
        await options?.onUpdate?.(completed)
        return completed
      },
    )
  const sendMessage = jest.spyOn(api, 'sendMessage')
  const steer = jest.spyOn(api, 'steer').mockImplementation(async () => {
    steeringStarted.resolve()
    await steeringFinished.promise
  })
  const instance = await createInstance(undefined, api)
  try {
    await dispatch(instance, {
      name: 'composer',
      type: 'input',
      value: 'Start this turn',
    })
    const first = instance.submit()
    await started.promise
    await dispatch(instance, {
      name: 'composer',
      type: 'input',
      value: 'Steer this turn',
    })
    const second = instance.submit()
    await steeringStarted.promise
    finish.resolve()
    await first
    await dispatch(instance, {
      name: 'composer',
      type: 'input',
      value: 'Preserve this draft',
    })
    await instance.submit()
    expect(sendMessage).not.toHaveBeenCalled()
    expect(steer).toHaveBeenCalledTimes(1)
    expect(instance.getState().draft).toBe('Preserve this draft')
    steeringFinished.resolve()
    await second
  } finally {
    finish.resolve()
    steeringFinished.resolve()
    instance.dispose?.()
  }
})

test('a follow-up waits for its own completed turn to release execution', async () => {
  const terminalShown = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const api = createMockChatApi()
  jest
    .spyOn(api, 'createTask')
    .mockImplementation(
      async (
        message,
        modelId,
        options?: Readonly<Pick<ChatRunOptions, 'onUpdate'>>,
      ) => {
        const task: ChatTask = {
          createdAt: new Date().toISOString(),
          events: [createEvent({ text: message, type: 'user-message' })],
          id: 'finishing-turn',
          modelId,
          status: 'running',
          title: 'Finishing turn',
          updatedAt: new Date().toISOString(),
        }
        await options?.onUpdate?.(task)
        const completed = { ...task, status: 'completed' as const }
        await options?.onUpdate?.(completed)
        terminalShown.resolve()
        await release.promise
        return completed
      },
    )
  const sendMessage = jest.spyOn(api, 'sendMessage')
  const instance = await createInstance(undefined, api)
  try {
    await dispatch(instance, {
      name: 'composer',
      type: 'input',
      value: 'First message',
    })
    const first = instance.submit()
    await terminalShown.promise
    await dispatch(instance, {
      name: 'composer',
      type: 'input',
      value: 'Follow-up message',
    })
    const second = instance.submit()
    await flushPromises()
    expect(sendMessage).not.toHaveBeenCalled()
    release.resolve()
    await Promise.all([first, second])
    expect(sendMessage).toHaveBeenCalledTimes(1)
  } finally {
    release.resolve()
    instance.dispose?.()
  }
})

test.each([false, true])(
  'an older task-list refresh cannot restore running status after completion (selected: %s)',
  async (selected) => {
    const channels: BroadcastChannel[] = []
    const originalBroadcastChannel = BroadcastChannel
    class TestBroadcastChannel extends BroadcastChannel {
      constructor(name: Readonly<string>) {
        super(name)
        channels.push(this)
      }
    }
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: TestBroadcastChannel,
    })
    const baseApi = createMockChatApi()
    const [original] = await baseApi.listTasks(1)
    if (!original) throw new Error('Expected a mock task')
    const running: ChatTask = { ...original, status: 'running' }
    const completed: ChatTask = { ...original, status: 'completed' }
    const started = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const refreshStarted = Promise.withResolvers<void>()
    const staleList = Promise.withResolvers<readonly ChatTask[]>()
    let blockRefresh = false
    const instance = await createInstance(undefined, {
      ...baseApi,
      async createTask(
        _message,
        _model,
        options?: Readonly<Pick<ChatRunOptions, 'onUpdate'>>,
      ) {
        await options?.onUpdate?.(running)
        started.resolve()
        await finish.promise
        return completed
      },
      async getTask() {
        return running
      },
      async listTasks() {
        if (blockRefresh) {
          refreshStarted.resolve()
          return staleList.promise
        }
        return [original]
      },
    })
    let submission: Promise<void> | undefined
    try {
      await dispatch(instance, {
        name: 'composer',
        type: 'input',
        value: 'Start a task',
      })
      submission = instance.submit()
      await started.promise
      if (!selected) await instance.newChat()
      blockRefresh = true
      channels[0]?.onmessage?.(
        new MessageEvent('message', { data: { type: 'tasks-changed' } }),
      )
      await refreshStarted.promise
      finish.resolve()
      await submission
      expect(
        instance.getState().tasks.find((task) => task.id === original.id)
          ?.status,
      ).toBe('completed')
      staleList.resolve([running])
      await flushPromises()
      expect(
        instance.getState().tasks.find((task) => task.id === original.id)
          ?.status,
      ).toBe('completed')
      expect(instance.getState().selectedTask?.id).toBe(
        selected ? original.id : undefined,
      )
    } finally {
      finish.resolve()
      staleList.resolve([running])
      await submission
      instance.dispose?.()
      Object.defineProperty(globalThis, 'BroadcastChannel', {
        configurable: true,
        value: originalBroadcastChannel,
      })
    }
  },
)

test('refreshes changed tasks from another tab without replacing the draft', async () => {
  const channels: TestBroadcastChannel[] = []
  class TestBroadcastChannel extends BroadcastChannel {
    constructor(name: Readonly<string>) {
      super(name)
      channels.push(this)
    }

    override postMessage(data: Readonly<unknown>): void {
      for (const channel of channels) {
        if (channel !== this) {
          channel.onmessage?.(new MessageEvent('message', { data }))
        }
      }
    }
  }
  const originalBroadcastChannel = BroadcastChannel
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    value: TestBroadcastChannel,
  })
  const baseApi = createMockChatApi()
  const [task, createdTask] = await baseApi.listTasks(2)
  if (!task || !createdTask) {
    throw new Error('Expected a mock task')
  }
  let storedTasks = [task]
  const api = {
    ...baseApi,
    async getTask(id: string) {
      return storedTasks.find((item) => item.id === id)
    },
    async listTasks() {
      return storedTasks.filter((item) => !item.archived)
    },
  }
  const instance = await createInstance(undefined, api)
  const secondInstance = await createInstance(undefined, api)
  const channel = new BroadcastChannel(taskStoreChannelName)

  try {
    for (const viewInstance of [instance, secondInstance]) {
      viewInstance.setState({
        ...viewInstance.getState(),
        draft: 'keep this draft',
        selectedTask: task,
      })
    }
    storedTasks = [{ ...task, title: 'Updated in another tab' }, createdTask]
    channel.postMessage({ type: 'tasks-changed' })
    await new Promise((resolve) => setTimeout(resolve, 30))

    for (const viewInstance of [instance, secondInstance]) {
      expect(viewInstance.getState().selectedTask?.title).toBe(
        'Updated in another tab',
      )
      expect(viewInstance.getState().tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: createdTask.id }),
        ]),
      )
      expect(viewInstance.getState().draft).toBe('keep this draft')
    }

    storedTasks = [{ ...task, archived: true }, createdTask]
    channel.postMessage({ type: 'tasks-changed' })
    await new Promise((resolve) => setTimeout(resolve, 30))

    for (const viewInstance of [instance, secondInstance]) {
      expect(viewInstance.getState().selectedTask).toBeUndefined()
      expect(viewInstance.getState().tasks).toEqual([
        expect.objectContaining({ id: createdTask.id }),
      ])
      expect(viewInstance.getState().draft).toBe('keep this draft')
    }
  } finally {
    channel.close()
    instance.dispose?.()
    secondInstance.dispose?.()
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: originalBroadcastChannel,
    })
  }
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

test('opens a task on primary mousedown by default', async () => {
  const instance = await createTestInstance()
  const taskButton = (instance.render() as readonly any[]).find(
    (node) => node.name === 'task:mock-task-1',
  )

  try {
    expect(taskButton).toEqual(
      expect.objectContaining({ onMouseDown: 'handleTaskMouseDown' }),
    )
    expect(view.eventListeners).toContainEqual(
      expect.objectContaining({
        name: 'handleTaskClick',
        params: [
          'handleTaskClick',
          'event.currentTarget.name',
          'event.button',
          'event.detail',
        ],
      }),
    )
    expect(view.eventListeners).toContainEqual(
      expect.objectContaining({
        name: 'handleTaskMouseDown',
        params: [
          'handleTaskMouseDown',
          'event.currentTarget.name',
          'event.button',
        ],
      }),
    )
    await instance.toggleFocusMode()
    const focusModeTaskButton = (instance.render() as readonly any[]).find(
      (node) => node.name === 'task:mock-task-1',
    )
    expect(focusModeTaskButton).toEqual(
      expect.objectContaining({ onMouseDown: 'handleTaskMouseDown' }),
    )

    await instance.handleTaskMouseDown('task:mock-task-1', 1)
    expect(instance.getState().selectedTask).toBeUndefined()

    await instance.handleTaskMouseDown('task:mock-task-1', 0)
    expect(instance.getState().selectedTask?.id).toBe('mock-task-1')
    await instance.handleTaskClick('task:mock-task-2', 1, 1)
    expect(instance.getState().selectedTask?.id).toBe('mock-task-1')

    await dispatch(instance, { name: 'task:mock-task-1', type: 'click' })
    expect(instance.getState().selectedTask?.id).toBe('mock-task-1')
    await instance.newChat()
    await instance.handleTaskClick('task:mock-task-2', 0, 0)
    expect(instance.getState().selectedTask?.id).toBe('mock-task-2')
  } finally {
    instance.dispose?.()
  }
})

test('opens a task on click when configured', async () => {
  const instance = await createTestInstance(0, async (key) =>
    key === 'chat2.taskOpenMode' ? 'click' : undefined,
  )
  const taskButton = (instance.render() as readonly any[]).find(
    (node) => node.name === 'task:mock-task-1',
  )

  try {
    expect(taskButton).not.toHaveProperty('onMouseDown')
    await instance.handleTaskMouseDown('task:mock-task-1', 0)
    expect(instance.getState().selectedTask).toBeUndefined()
    await instance.handleTaskClick('task:mock-task-1', 1, 1)
    expect(instance.getState().selectedTask).toBeUndefined()

    await dispatch(instance, { name: 'task:mock-task-1', type: 'click' })
    expect(instance.getState().selectedTask?.id).toBe('mock-task-1')
    await instance.newChat()
    await instance.handleTaskClick('task:mock-task-2', 0, 0)
    expect(instance.getState().selectedTask?.id).toBe('mock-task-2')
  } finally {
    instance.dispose?.()
  }
})

test('renames the selected chat from its title context menu', async () => {
  const baseApi = createMockChatApi()
  const originalTask = await baseApi.getTask('mock-task-1')
  if (!originalTask) {
    throw new Error('Expected mock task')
  }
  const renameTask = jest.fn(async (id: string, title: string) => ({
    ...originalTask,
    id,
    title,
    titleGenerated: true,
  }))
  const api = { ...baseApi, renameTask }
  const showContextMenu = jest.fn(
    async (_menuId: string, _x: number, _y: number) => {},
  )
  const execute = jest.fn(async (id: string, ..._args: readonly unknown[]) => {
    if (id === 'Layout.getHref') {
      return ''
    }
    if (id === 'ExtensionHostQuickPick.showQuickInput') {
      return 'Planning notes'
    }
    return undefined
  })
  const instance = await createInstance(
    {
      ...createViewContext({ selectedTaskId: originalTask.id }),
      showContextMenu,
    },
    api,
    undefined,
    execute,
  )

  try {
    const titleNode = instance
      .render()
      .find((node) => node.className?.split(' ').includes('ChatDetailTitle'))
    expect(titleNode).toEqual(
      expect.objectContaining({
        name: 'chat-title',
        onContextMenu: 'handleContextMenu',
      }),
    )

    const titleMenuButton = instance
      .render()
      .find((node) =>
        node.className?.split(' ').includes('ChatTitleMenuButton'),
      )
    expect(titleMenuButton).toEqual(
      expect.objectContaining({
        ariaLabel: 'Open chat menu',
        name: 'title-menu',
        type: VirtualDomElements.Button,
      }),
    )

    await instance.handleTitleMenuClick(15, 25)
    expect(showContextMenu).toHaveBeenLastCalledWith('chat2.title', 15, 25)
    expect(instance.getMenuEntries('chat2.title')).toEqual([
      expect.objectContaining({ id: 'rename-chat', label: 'Rename' }),
    ])

    await dispatchTitleContextMenu(instance)
    expect(showContextMenu).toHaveBeenLastCalledWith('chat2.title', 10, 20)
    expect(instance.getMenuEntries('chat2.title')).toEqual([
      expect.objectContaining({ id: 'rename-chat', label: 'Rename' }),
    ])

    instance.handleRenameTask()
    await flushPromises()

    expect(execute).toHaveBeenCalledWith(
      'ExtensionHostQuickPick.showQuickInput',
      { placeholder: 'Enter a chat name', value: originalTask.title },
    )
    expect(renameTask).toHaveBeenCalledWith(originalTask.id, 'Planning notes')
    expect(instance.getState().selectedTask?.title).toBe('Planning notes')
    expect(
      instance.getState().tasks.find((task) => task.id === originalTask.id)
        ?.title,
    ).toBe('Planning notes')
  } finally {
    instance.dispose?.()
  }
})

test('renames the original chat if the active session changes while prompting', async () => {
  const baseApi = createMockChatApi()
  const originalTask = await baseApi.getTask('mock-task-1')
  const nextTask = await baseApi.getTask('mock-task-2')
  if (!originalTask || !nextTask) {
    throw new Error('Expected mock tasks')
  }
  const titlePrompt = Promise.withResolvers<string | undefined>()
  const renameTask = jest.fn(async (id: string, title: string) => ({
    ...originalTask,
    id,
    title,
    titleGenerated: true,
  }))
  const execute = jest.fn(async (id: string, ..._args: readonly unknown[]) => {
    if (id === 'Layout.getHref') {
      return ''
    }
    if (id === 'ExtensionHostQuickPick.showQuickInput') {
      return titlePrompt.promise
    }
    return undefined
  })
  const instance = await createInstance(
    createViewContext({ selectedTaskId: originalTask.id }),
    { ...baseApi, renameTask },
    undefined,
    execute,
  )

  try {
    await dispatchTitleContextMenu(instance)
    instance.handleRenameTask()
    await dispatch(instance, { name: `task:${nextTask.id}`, type: 'click' })
    titlePrompt.resolve('Renamed original chat')
    await flushPromises()

    expect(renameTask).toHaveBeenCalledWith(
      originalTask.id,
      'Renamed original chat',
    )
    expect(instance.getState().selectedTask?.id).toBe(nextTask.id)
    expect(instance.getState().selectedTask?.title).toBe(nextTask.title)
    expect(
      instance.getState().tasks.find((task) => task.id === originalTask.id)
        ?.title,
    ).toBe('Renamed original chat')
  } finally {
    instance.dispose?.()
  }
})

test.each([
  ['blank', ''],
  ['whitespace-only', ' \t  '],
  ['over the title limit', 'x'.repeat(81)],
])(
  'keeps the existing title when the new name is %s',
  async (_label, value) => {
    const baseApi = createMockChatApi()
    const originalTask = await baseApi.getTask('mock-task-1')
    if (!originalTask) {
      throw new Error('Expected mock task')
    }
    const renameTask = jest.fn(
      async (_id: string, _title: string): Promise<ChatTask | undefined> =>
        undefined,
    )
    const execute = jest.fn(
      async (id: string, ..._args: readonly unknown[]) => {
        if (id === 'Layout.getHref') {
          return ''
        }
        return value
      },
    )
    const instance = await createInstance(
      createViewContext({ selectedTaskId: originalTask.id }),
      { ...baseApi, renameTask },
      undefined,
      execute,
    )

    try {
      await dispatchTitleContextMenu(instance)
      instance.handleRenameTask()
      await flushPromises()

      expect(renameTask).not.toHaveBeenCalled()
      expect(instance.getState().selectedTask?.title).toBe(originalTask.title)
    } finally {
      instance.dispose?.()
    }
  },
)

test('keeps the existing title when renaming is canceled', async () => {
  const baseApi = createMockChatApi()
  const originalTask = await baseApi.getTask('mock-task-1')
  if (!originalTask) {
    throw new Error('Expected mock task')
  }
  const renameTask = jest.fn(
    async (_id: string, _title: string): Promise<ChatTask | undefined> =>
      undefined,
  )
  const execute = jest.fn(async (id: string, ..._args: readonly unknown[]) => {
    if (id === 'Layout.getHref') {
      return ''
    }
    return undefined
  })
  const instance = await createInstance(
    createViewContext({ selectedTaskId: originalTask.id }),
    { ...baseApi, renameTask },
    undefined,
    execute,
  )

  try {
    await dispatchTitleContextMenu(instance)
    instance.handleRenameTask()
    await flushPromises()

    expect(renameTask).not.toHaveBeenCalled()
    expect(instance.getState().selectedTask?.title).toBe(originalTask.title)
  } finally {
    instance.dispose?.()
  }
})

test('accepts a title at the 80 character limit', async () => {
  const baseApi = createMockChatApi()
  const originalTask = await baseApi.getTask('mock-task-1')
  if (!originalTask) {
    throw new Error('Expected mock task')
  }
  const title = 'x'.repeat(80)
  const renameTask = jest.fn(async (id: string, nextTitle: string) => ({
    ...originalTask,
    id,
    title: nextTitle,
    titleGenerated: true,
  }))
  const execute = jest.fn(async (id: string, ..._args: readonly unknown[]) => {
    if (id === 'Layout.getHref') {
      return ''
    }
    return title
  })
  const instance = await createInstance(
    createViewContext({ selectedTaskId: originalTask.id }),
    { ...baseApi, renameTask },
    undefined,
    execute,
  )

  try {
    await dispatchTitleContextMenu(instance)
    instance.handleRenameTask()
    await flushPromises()

    expect(renameTask).toHaveBeenCalledWith(originalTask.id, title)
    expect(instance.getState().selectedTask?.title).toBe(title)
  } finally {
    instance.dispose?.()
  }
})

test('renders a Sessions sash and resizes the panel with bounded pointer movement', async () => {
  const instance = await createTestInstance()
  instance.setState({ ...instance.getState(), focusMode: true })
  const sash = getNodesByClass(instance.render(), 'ChatSessionsSash')[0]

  expect(sash).toEqual(
    expect.objectContaining({
      ariaLabel: 'Resize sessions panel',
      ariaOrientation: 'vertical',
      onDblClick: 'handleSessionsSashDoubleClick',
      onPointerDown: 'handleSessionsSashPointerDown',
      role: 'separator',
    }),
  )
  expect(view.eventListeners).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'handleSessionsSashDoubleClick',
        params: ['handleSessionsSashDoubleClick'],
      }),
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
  expect(
    instance
      .render()
      .find((node) => node.className?.startsWith('ChatSessions '))?.className,
  ).toContain('ChatSessionsWidth-330')
  expect(instance.getCss?.()).toContain(
    '.ChatSessionsWidth-330{--ChatSessionsWidth:330px}',
  )
  instance.handleSessionsSashPointerMove(2000)
  expect(instance.getState().sessionsWidth).toBe(680)
  instance.handleSessionsSashPointerUp()
  instance.handleSessionsSashPointerMove(100)
  expect(instance.getState().sessionsWidth).toBe(680)

  instance.handleSessionsSashPointerDown(400, 1000, 100, 820, 280)
  instance.handleSessionsSashPointerMove(450)
  expect(instance.getState().sessionsWidth).toBe(230)

  instance.handleSessionsSashDoubleClick()
  expect(instance.getState().sessionsWidth).toBeUndefined()
  expect(
    instance.render().find((node) => node.className === 'ChatSessions')
      ?.className,
  ).toBe('ChatSessions')
  expect(instance.getCss?.()).not.toContain('ChatSessionsWidth-')
  instance.handleSessionsSashPointerMove(500)
  expect(instance.getState().sessionsWidth).toBeUndefined()
  instance.handleSessionsSashDoubleClick()
  expect(instance.getState().sessionsWidth).toBeUndefined()

  instance.handleSessionsSashPointerDown(400, 1000, 100, 100, 280)
  instance.handleSessionsSashPointerMove(450)
  expect(instance.getState().sessionsWidth).toBe(330)
  instance.handleSessionsSashPointerUp()
  instance.dispose?.()
})

test('shows a session selector toggle in focus mode', async () => {
  const instance = await createTestInstance()
  instance.setState({ ...instance.getState(), focusMode: true })

  const toggle = getNodesByClass(
    instance.render(),
    'ChatSessionsToggleButton',
  )[0]
  expect(toggle).toEqual(
    expect.objectContaining({
      ariaExpanded: false,
      name: 'toggle-sessions',
    }),
  )

  await instance.handleEvent({ name: 'toggle-sessions', type: 'click' })

  expect(instance.getState().sessionsVisible).toBe(true)
  expect(instance.render()[0]).toEqual(
    expect.objectContaining({
      className: expect.stringContaining('ChatSessionsVisible'),
    }),
  )
  instance.dispose?.()
})

test('toggles the AI-native sessions list without resetting its width or active task', async () => {
  const instance = await createTestInstance()
  instance.setState({
    ...instance.getState(),
    draft: 'preserved draft',
    focusMode: true,
    sessionsWidth: 360,
  })

  await instance.toggleSessionsList()

  expect(getNodesByClass(instance.render(), 'ChatSessions')).toHaveLength(0)
  expect(getNodesByClass(instance.render(), 'ChatSessionsSash')).toHaveLength(0)
  expect(
    getNodesByClass(instance.render(), 'ChatConversationBody'),
  ).toHaveLength(1)
  expect(instance.getState().draft).toBe('preserved draft')

  await instance.toggleSessionsList()

  expect(getNodesByClass(instance.render(), 'ChatSessions')).toHaveLength(1)
  expect(getNodesByClass(instance.render(), 'ChatSessionsSash')).toHaveLength(1)
  expect(instance.getState().sessionsWidth).toBe(360)
  expect(instance.getState().draft).toBe('preserved draft')
  instance.dispose?.()
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

  const attachmentEvent = instance
    .getState()
    .selectedTask?.events.find((event) => event.type === 'user-message')
  if (attachmentEvent?.type !== 'user-message') {
    throw new Error('Expected the submitted user image attachment')
  }
  expect(attachmentEvent.attachments?.[0]?.objectUrl).toContain('blob:')
  expect(instance.getState().selectedTask?.events).toContainEqual(
    expect.objectContaining({
      text: 'Describe this',
      type: 'user-message',
    }),
  )
  expect(instance.render()).toContainEqual(
    expect.objectContaining({
      alt: 'sample.png',
      className: 'ChatMessageImage',
      src: expect.any(String),
    }),
  )
})

test('renders generated assistant images and opens a dismissible image preview', async () => {
  const instance = await createTestInstance()
  const image = {
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    mimeType: 'image/png',
    name: 'Generated image 1.png',
  }
  const message = createEvent({
    images: [image],
    text: 'Here is the image.',
    type: 'assistant-message',
  })
  const task: ChatTask = {
    createdAt: '2026-01-01T00:00:00.000Z',
    events: [message],
    id: 'task-image-preview',
    modelId: 'gpt-test',
    status: 'completed',
    title: 'Image',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  instance.setState({ ...instance.getState(), selectedTask: task })
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(instance.render()).toContainEqual(
    expect.objectContaining({
      alt: image.name,
      className: 'ChatMessageImage',
      src: expect.any(String),
    }),
  )
  await dispatch(instance, {
    name: `open-image:${message.id}:0`,
    type: 'click',
  })
  expect(
    getNodesByClass(instance.render(), 'ChatImagePreviewOverlay'),
  ).toHaveLength(1)
  expect(instance.render()).toContainEqual(
    expect.objectContaining({
      className: 'ChatImagePreview',
      src: expect.any(String),
    }),
  )
  await dispatch(instance, { name: 'close-image-preview', type: 'click' })
  expect(
    getNodesByClass(instance.render(), 'ChatImagePreviewOverlay'),
  ).toHaveLength(0)
  await dispatch(instance, {
    name: `open-image:${message.id}:0`,
    type: 'click',
  })
  instance.handleKeyDown('Escape')
  expect(
    getNodesByClass(instance.render(), 'ChatImagePreviewOverlay'),
  ).toHaveLength(0)
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

  const submittedMessage = instance
    .getState()
    .selectedTask?.events.find((event) => event.type === 'user-message')
  if (submittedMessage?.type !== 'user-message') {
    throw new Error('Expected a user message with the pasted image')
  }
  expect(submittedMessage.attachments?.[0]?.objectUrl).toContain('blob:')
  expect(submittedMessage).toEqual(
    expect.objectContaining({
      attachments: [
        expect.objectContaining({
          dataUrl: 'data:image/png;base64,aGVsbG8=',
          mimeType: 'image/png',
          name: 'pasted.png',
        }),
      ],
    }),
  )
})

test('preserves ordinary text paste when image paste prevents the browser default', async () => {
  const instance = await createTestInstance()
  instance.setState({ ...instance.getState(), draft: 'abc' })

  try {
    await instance.handleImagePaste([], ' text ', 1, 2)

    expect(instance.getState().draft).toBe('a text c')
    expect(instance.getState().errorMessage).toBe('')
    expect(view.eventListeners).toContainEqual(
      expect.objectContaining({
        name: 'handleImagePaste',
        preventDefault: true,
      }),
    )
  } finally {
    instance.dispose?.()
  }
})

test('text paste finishes without waiting for a render queued behind its event', async () => {
  const requestRerender = jest.fn(async () => {})
  const context = { ...createViewContext(undefined), requestRerender }
  const instance = await createInstance(context, createMockChatApi())
  try {
    instance.setState({ ...instance.getState(), draft: 'before after' })
    requestRerender.mockClear()
    await instance.handleImagePaste([], 'first line\nsecond line ', 7, 7)
    expect(instance.getState().draft).toBe(
      'before first line\nsecond line after',
    )
    expect(requestRerender).not.toHaveBeenCalled()
    expect(instance.render()).toContainEqual(
      expect.objectContaining({
        name: 'composer',
        value: 'before first line\nsecond line after',
      }),
    )
  } finally {
    instance.dispose?.()
  }
})

test('prevents the browser default while dragging files over the chat', async () => {
  const instance = await createTestInstance()

  try {
    expect(view.eventListeners).toContainEqual(
      expect.objectContaining({
        name: 'handleDragOver',
        params: ['handleDragOver'],
        preventDefault: true,
      }),
    )
    expect(instance.render()).toContainEqual(
      expect.objectContaining({ onDragOver: 'handleDragOver' }),
    )
  } finally {
    instance.dispose?.()
  }
})

test('does not paste an unreadable local image path into the composer', async () => {
  const instance = await createTestInstance()
  instance.setState({ ...instance.getState(), draft: 'keep this draft' })

  try {
    await instance.handleImagePaste(
      [],
      '/home/simon/Downloads/Pasted image.png',
      15,
      15,
    )

    expect(instance.getState().draft).toBe('keep this draft')
    expect(instance.getState().errorMessage).toContain(
      'only provided the image file path',
    )
  } finally {
    instance.dispose?.()
  }
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

test('direct chat-route navigation selects the AI-native layout without a task fragment', async () => {
  const execute = jest.fn(
    async (command: string, ..._args: readonly unknown[]) => {
      return command === 'Layout.getHref'
        ? 'https://example.com/prefix/chat?workspace=project'
        : undefined
    },
  )
  const instance = await createInstance(
    undefined,
    createMockChatApi(),
    undefined,
    execute,
  )

  expect(instance.getState().focusMode).toBe(true)
  expect(instance.renderWorkbenchLayout()).toBe('ai-native')
  expect(instance.getState().selectedTask).toBeUndefined()
  instance.dispose?.()
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
    async (command: string, ..._args: readonly unknown[]) =>
      command === 'Layout.getHref'
        ? 'https://example.com/static/#chat-old-task'
        : undefined,
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

test('switching to AI-native layout keeps the deployment prefix, query, and selected task', async () => {
  let focusMode = false
  const execute = jest.fn(
    async (command: string, ..._args: readonly unknown[]) => {
      if (command === 'Layout.getHref') {
        return 'https://example.com/prefix/?workspace=project'
      }
      if (command === 'Layout.getAssetDir') {
        return '/prefix/commit'
      }
      if (command === 'Layout.getSideBarFocusMode') {
        return focusMode
      }
      if (command === 'Layout.setPathName') {
        focusMode = !focusMode
      }
      return undefined
    },
  )
  const instance = await createInstance(
    undefined,
    createMockChatApi(),
    undefined,
    execute,
  )
  const state = instance.getState() as { focusModeEnabled: boolean }
  state.focusModeEnabled = true

  await dispatch(instance, { name: 'task:mock-task-2', type: 'click' })
  await instance.toggleFocusMode()

  expect(execute).toHaveBeenCalledWith(
    'Layout.setPathName',
    '/prefix/chat?workspace=project#mock-task-2',
  )
  await instance.toggleFocusMode()
  expect(execute).toHaveBeenCalledWith(
    'Layout.setPathName',
    '/prefix/?workspace=project',
  )
  instance.dispose?.()
})

test('desktop layout changes preserve the served path and encode the selected conversation in the fragment', async () => {
  const execute = jest.fn(
    async (command: string, ..._args: readonly unknown[]) => {
      if (command === 'Layout.getHref') {
        return 'lvce://-/'
      }
      if (command === 'Layout.getSideBarFocusMode') {
        return false
      }
      return undefined
    },
  )
  const instance = await createInstance(
    undefined,
    createMockChatApi(),
    undefined,
    execute,
  )
  const state = instance.getState() as { focusModeEnabled: boolean }
  state.focusModeEnabled = true
  await dispatch(instance, { name: 'task:mock-task-2', type: 'click' })
  await instance.toggleFocusMode()
  expect(execute).toHaveBeenCalledWith('Layout.setHash', '#chat-mock-task-2')
  expect(execute).not.toHaveBeenCalledWith(
    'Layout.setPathName',
    expect.anything(),
  )
  instance.dispose?.()
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
      className: 'ChatView ChatAiNativeLayout ChatTheme-default',
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
  expect(
    getNodesByClass(instance.render(), 'ChatTaskList')[0].className,
  ).toContain('ChatTaskListStyle-')
  expect(instance.getCss?.()).toContain(
    '--ChatTaskFontFamily:inherit;--ChatTaskFontSize:20px',
  )
})

test.each([undefined, 20, '', '-2px', 'calc(20px)', '20px; color: red'])(
  'falls back for invalid task list font size %p',
  async (fontSize) => {
    const instance = await createTestInstance(0, async (key) => {
      return key === 'chat2.fontSize' ? fontSize : undefined
    })

    expect(instance.getState().fontSize).toBe('13px')
    expect(
      getNodesByClass(instance.render(), 'ChatTaskList')[0].className,
    ).toContain('ChatTaskListStyle-')
    expect(instance.getCss?.()).toContain(
      '--ChatTaskFontFamily:inherit;--ChatTaskFontSize:13px',
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
  expect(instance.getCss?.()).toContain(
    '--ChatTaskFontFamily:"Fira Code", monospace;--ChatTaskFontSize:13px',
  )
})

test('uses the role-specific message font defaults', async () => {
  const instance = await createTestInstance()

  expect(instance.getState().assistantMessageFontFamily).toBe(
    "Georgia, 'Times New Roman', serif",
  )
  expect(instance.getState().userMessageFontFamily).toBe('sans-serif')
  expect(instance.getCss?.()).toContain(
    ".ChatMessageAssistant .ChatMessageText{font-family:Georgia, 'Times New Roman', serif}",
  )
})

test('reads independent role-specific message font preferences', async () => {
  const instance = await createTestInstance(0, async (key) => {
    if (key === 'chat2.assistantMessageFontFamily') {
      return '"Fira Code", monospace'
    }
    if (key === 'chat2.userMessageFontFamily') {
      return 'Arial, sans-serif'
    }
  })

  expect(instance.getState().assistantMessageFontFamily).toBe(
    '"Fira Code", monospace',
  )
  expect(instance.getState().userMessageFontFamily).toBe('Arial, sans-serif')
  expect(instance.getCss?.()).toContain(
    '.ChatMessageAssistant .ChatMessageText{font-family:"Fira Code", monospace}',
  )
  expect(instance.getCss?.()).toContain(
    '.ChatMessageUser .ChatMessageText{font-family:Arial, sans-serif}',
  )
})

test.each([
  ['chat2.assistantMessageFontFamily', "Georgia, 'Times New Roman', serif"],
  ['chat2.userMessageFontFamily', 'sans-serif'],
])(
  'uses the role default for invalid message font family %s',
  async (preferenceKey, expected) => {
    for (const fontFamily of ['', 'Arial; color: red', 'Arial\nmonospace']) {
      const instance = await createTestInstance(0, async (key) => {
        return key === preferenceKey ? fontFamily : undefined
      })

      const stateKey =
        preferenceKey === 'chat2.assistantMessageFontFamily'
          ? 'assistantMessageFontFamily'
          : 'userMessageFontFamily'
      expect(instance.getState()[stateKey]).toBe(expected)
    }
  },
)

test.each([undefined, 20, '', 'Arial; color: red', 'Arial\nmonospace'])(
  'falls back for invalid task list font family %p',
  async (fontFamily) => {
    const instance = await createTestInstance(0, async (key) => {
      return key === 'chat2.fontFamily' ? fontFamily : undefined
    })

    expect(instance.getState().fontFamily).toBe('inherit')
    expect(instance.getCss?.()).toContain(
      '--ChatTaskFontFamily:inherit;--ChatTaskFontSize:13px',
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
  expect(getText(dom)).not.toContain('Undo ↩')
  expect(getText(dom)).toContain('Review')
  expect(getNodesByClass(dom, 'ChatChangedFile')).toHaveLength(3)
  expect(getText(dom)).toContain('Show 2 more files  ⌄')
  expect(
    dom.findIndex((node) => node.className === 'ChatChanges'),
  ).toBeLessThan(dom.findIndex((node) => node.className === 'ChatComposerArea'))
  expect(instance.renderTitle()).toBe('Chat 2: Build a smaller chat view')
  expect(instance.getState().draft).toBe('')
})

test('renders Markdown and bare urls as external links and preserves punctuation', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value:
      'l [VS Code download page](https://code.visualstudio.com/Download). Also https://example.com/docs?q=chat.',
  })
  await instance.submit()

  const dom = instance.render() as readonly any[]
  expect(dom).toContainEqual({
    childCount: 1,
    className: 'ChatMessageLink',
    href: 'https://code.visualstudio.com/Download',
    rel: 'noopener noreferrer',
    target: '_blank',
    title: 'https://code.visualstudio.com/Download',
    type: VirtualDomElements.A,
  })
  expect(dom).toContainEqual({
    childCount: 1,
    className: 'ChatMessageLink',
    href: 'https://example.com/docs?q=chat',
    rel: 'noopener noreferrer',
    target: '_blank',
    title: 'https://example.com/docs?q=chat',
    type: VirtualDomElements.A,
  })
  expect(getText(dom)).toContain(
    'l \nVS Code download page\n. Also \nhttps://example.com/docs?q=chat\n.',
  )
})

test('renders explicit native file citations as workspace links without activating unsafe citations or code', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value:
      'Evidence citefile:///workspace/src/auth.ts#L1-L2 and [README](memfs:///workspace/README.md#L1). Unsafe citejavascript:alert(1).\n```text\ncitefile:///workspace/literal.ts#L2\n```',
  })
  await instance.submit()
  const dom = instance.render() as readonly any[]
  const links = getNodesByClass(dom, 'ChatFileLink')
  expect(links.map((node) => node.name)).toEqual([
    `open-file:${encodeURIComponent('file:///workspace/src/auth.ts#L1-L2')}`,
    `open-file:${encodeURIComponent('memfs:///workspace/README.md#L1')}`,
  ])
  expect(getText(dom)).toContain('auth.ts#L1-L2')
  expect(getText(dom)).toContain('citejavascript:alert(1)')
  expect(getText(dom)).toContain('citefile:///workspace/literal.ts#L2')
  instance.dispose?.()
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
        className:
          'ChatMessageTableCell ChatMessageTableCell-left ChatMessageTableHeader',
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
        className:
          'ChatMessageTableCell ChatMessageTableCell-center ChatMessageTableHeader',
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

test('renders Markdown headings in saved and streaming messages', async () => {
  const timestamp = '2026-09-10T12:00:00.000Z'
  const task: ChatTask = {
    createdAt: timestamp,
    events: [
      createEvent({ text: 'Show headings', type: 'user-message' }),
      createEvent({
        text: 'Before\n# Heading one\n## Heading **two**\n### João Gonçalves Zarco\n#### Heading four\n##### Heading five\n###### Heading six',
        type: 'assistant-message',
      }),
    ],
    id: 'heading-task',
    modelId: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    status: 'running',
    streamingText: 'Streaming **heading**\n### End heading',
    title: 'Show headings',
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
    const headings = dom.filter((node) =>
      node.className?.split(' ').includes('ChatMessageHeading'),
    )
    expect(headings.map((node) => node.type)).toEqual([
      VirtualDomElements.H1,
      VirtualDomElements.H2,
      VirtualDomElements.H3,
      VirtualDomElements.H4,
      VirtualDomElements.H5,
      VirtualDomElements.H6,
      VirtualDomElements.H3,
    ])
    expect(headings.map((node) => node.className)).toEqual([
      'ChatMessageHeading ChatMessageHeading-1',
      'ChatMessageHeading ChatMessageHeading-2',
      'ChatMessageHeading ChatMessageHeading-3',
      'ChatMessageHeading ChatMessageHeading-4',
      'ChatMessageHeading ChatMessageHeading-5',
      'ChatMessageHeading ChatMessageHeading-6',
      'ChatMessageHeading ChatMessageHeading-3',
    ])
    expect(
      dom.filter((node) => node.type === VirtualDomElements.Strong),
    ).toHaveLength(2)
    expect(getText(dom)).toContain('João Gonçalves Zarco')
    expect(getText(dom)).not.toContain('### João Gonçalves Zarco')
    expect(getText(dom)).toContain('Streaming')
    expect(getText(dom)).toContain('heading')
    expect(getText(dom)).toContain('End heading')
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

test('copies only the selected code block, including unfinished streaming code', async () => {
  const timestamp = '2026-09-10T12:00:00.000Z'
  const writeClipboardText = jest.fn(async (_text: string) => undefined)
  const assistantMessage = createEvent({
    text: 'Before\n```json\n{"name":"Zoë","markup":"<tag>"}\n```\n```\nsecond block\n```',
    type: 'assistant-message',
  })
  const task: ChatTask = {
    createdAt: timestamp,
    events: [assistantMessage],
    id: 'copy-code-task',
    modelId: 'gpt-5.4',
    status: 'completed',
    streamingText: '```\nunfinished Ω',
    title: 'Copy code',
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
    undefined,
    undefined,
    undefined,
    undefined,
    writeClipboardText,
  )
  try {
    const dom = instance.render() as readonly any[]
    const codeButtons = getNodesByClass(dom, 'ChatCodeCopyButton')
    expect(codeButtons).toHaveLength(3)
    expect(codeButtons[0]).toEqual(
      expect.objectContaining({ ariaLabel: 'Copy code', title: 'Copy code' }),
    )
    await dispatch(instance, {
      name: `copy-code:${assistantMessage.id}:1`,
      type: 'click',
    })
    expect(writeClipboardText).toHaveBeenCalledWith('second block\n')
    await dispatch(instance, {
      name: `copy-code:streaming:${task.id}:0`,
      type: 'click',
    })
    expect(writeClipboardText).toHaveBeenLastCalledWith('unfinished Ω')
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

test('renders message actions for both roles and shows feedback after copying', async () => {
  const writeClipboardText = jest.fn(async (_text: string) => undefined)
  const userMessage = createEvent({
    text: 'Add worker memory usage',
    type: 'user-message',
  })
  const assistantMessage = createEvent({
    text: 'I inspected the files and completed the change.',
    type: 'assistant-message',
  })
  const task: ChatTask = {
    createdAt: new Date().toISOString(),
    events: [userMessage, assistantMessage],
    id: 'mock-task-1',
    modelId: 'gpt-5.4',
    status: 'completed',
    title: userMessage.text,
    updatedAt: new Date().toISOString(),
  }
  const api = {
    ...createMockChatApi(),
    async getTask() {
      return task
    },
  }
  const instance = await createInstance(
    undefined,
    api,
    undefined,
    undefined,
    undefined,
    undefined,
    writeClipboardText,
  )
  await dispatch(instance, { name: 'task:mock-task-1', type: 'click' })

  const dom = instance.render() as readonly any[]
  expect(getNodesByClass(dom, 'ChatMessageMetadata')).toHaveLength(2)
  expect(getNodesByClass(dom, 'ChatMessageTimestamp')).toHaveLength(2)
  expect(getNodesByClass(dom, 'ChatMessageCopyButton')).toHaveLength(2)
  const copyButton = getNodesByClass(dom, 'ChatMessageCopyButton').find(
    (button) => button.name === `copy-message:${userMessage.id}`,
  )
  expect(copyButton).toBeDefined()
  expect(copyButton).toEqual(
    expect.objectContaining({
      ariaLabel: 'Copy message',
      title: 'Copy message',
    }),
  )

  await dispatch(instance, { name: copyButton.name, type: 'click' })

  expect(writeClipboardText).toHaveBeenCalledWith('Add worker memory usage')
  const copiedUserButton = getNodesByClass(
    instance.render() as readonly any[],
    'ChatMessageCopyButton',
  ).find((button) => button.name === `copy-message:${userMessage.id}`)
  expect(copiedUserButton).toEqual(
    expect.objectContaining({
      ariaLabel: 'Copied',
      className: 'ChatMessageCopyButton ChatMessageCopyButtonCopied',
      title: 'Copied',
    }),
  )

  const assistantCopyButton = getNodesByClass(
    instance.render() as readonly any[],
    'ChatMessageCopyButton',
  ).find((button) => button.name === `copy-message:${assistantMessage.id}`)
  expect(assistantCopyButton).toBeDefined()
  await dispatch(instance, { name: assistantCopyButton.name, type: 'click' })
  expect(writeClipboardText).toHaveBeenLastCalledWith(
    'I inspected the files and completed the change.',
  )
  const copiedAssistantButton = getNodesByClass(
    instance.render() as readonly any[],
    'ChatMessageCopyButton',
  ).find((button) => button.name === `copy-message:${assistantMessage.id}`)
  expect(copiedAssistantButton).toEqual(
    expect.objectContaining({
      ariaLabel: 'Copied',
      className: 'ChatMessageCopyButton ChatMessageCopyButtonCopied',
      title: 'Copied',
    }),
  )
  instance.dispose?.()
})

const rejectClipboardWrite = async (_text: string): Promise<void> => {
  throw new Error('Clipboard access denied')
}

test('surfaces clipboard permission failures without showing copied feedback', async () => {
  const instance = await createInstance(
    undefined,
    createMockChatApi(),
    undefined,
    undefined,
    undefined,
    undefined,
    rejectClipboardWrite,
  )
  await dispatch(instance, { name: 'task:mock-task-1', type: 'click' })
  const copyButton = getNodesByClass(
    instance.render() as readonly any[],
    'ChatMessageCopyButton',
  )[0]
  await expect(
    dispatch(instance, { name: copyButton.name, type: 'click' }),
  ).resolves.toBeUndefined()
  expect(instance.getState().errorMessage).toBe(
    'Unable to copy message: Clipboard access denied',
  )
  expect(instance.getState().copiedMessageId).toBe('')
  instance.dispose?.()
})

test('opens the model picker without adding model controls to the header', async () => {
  const instance = await createTestInstance()
  const closedDom = instance.render() as readonly any[]
  expect(getNodesByClass(closedDom, 'Chat2ModelPicker')).toHaveLength(0)
  expect(getNodesByClass(closedDom, 'ChatModelPickerHidden')).toHaveLength(0)
  expect(getNodesByClass(closedDom, 'ChatModelButton')[0]).toEqual(
    expect.objectContaining({ ariaExpanded: false }),
  )

  await dispatch(instance, { name: 'model-picker', type: 'click' })

  const dom = instance.render() as readonly any[]
  expect(getNodesByClass(dom, 'Chat2ModelPicker')).toHaveLength(1)
  expect(getNodesByClass(dom, 'ChatModelPickerHidden')).toHaveLength(0)
  expect(getText(dom)).toContain('Models')
  expect(getText(dom)).toContain('GPT-5.4')
})

test('shows supported thinking modes and marks the selected mode', async () => {
  const writePreference =
    jest.fn<(key: string, value: unknown) => Promise<void>>()
  const instance = await createTestInstance(
    0,
    undefined,
    undefined,
    writePreference,
  )
  const initialDom = instance.render() as readonly any[]
  expect(getNodesByClass(initialDom, 'ChatThinkingModeOption')).toHaveLength(0)
  expect(getNodesByClass(initialDom, 'ChatThinkingModeButton')).toHaveLength(1)
  await dispatch(instance, { name: 'thinking-mode-picker', type: 'click' })
  const initialOptions = getNodesByClass(
    instance.render() as readonly any[],
    'ChatThinkingModeOption',
  )
  expect(initialOptions).toHaveLength(3)
  expect(initialOptions).toContainEqual(
    expect.objectContaining({
      ariaPressed: true,
      name: 'thinking-mode:medium',
    }),
  )

  await dispatch(instance, { name: 'thinking-mode:high', type: 'click' })
  expect(instance.getState().thinkingModePickerOpen).toBe(false)
  await dispatch(instance, { name: 'thinking-mode-picker', type: 'click' })

  const updatedOptions = getNodesByClass(
    instance.render() as readonly any[],
    'ChatThinkingModeOption',
  )
  expect(updatedOptions).toContainEqual(
    expect.objectContaining({
      ariaPressed: true,
      name: 'thinking-mode:high',
    }),
  )
  expect(instance.getState().selectedThinkingMode).toBe('high')
  expect(writePreference).toHaveBeenCalledWith(
    'chat2.selectedThinkingMode',
    'high',
  )
  instance.dispose?.()
})

test('hides thinking mode control when its setting is disabled', async () => {
  const instance = await createTestInstance(0, async (key) =>
    key === 'chat2.thinkingModeEnabled' ? false : undefined,
  )
  expect(
    getNodesByClass(
      instance.render() as readonly any[],
      'ChatThinkingModeButton',
    ),
  ).toHaveLength(0)
  expect(instance.getState().thinkingModePickerOpen).toBe(false)
  instance.dispose?.()
})

test('closes the thinking mode popup on outside click and Escape', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, { name: 'thinking-mode-picker', type: 'click' })
  expect(instance.getState().thinkingModePickerOpen).toBe(true)
  instance.handleModelPickerOutsideClick('composer', undefined)
  expect(instance.getState().thinkingModePickerOpen).toBe(false)
  await dispatch(instance, { name: 'thinking-mode-picker', type: 'click' })
  instance.handleKeyDown('Escape')
  expect(instance.getState().thinkingModePickerOpen).toBe(false)
  instance.dispose?.()
})

test('closes the model picker when clicking outside it', async () => {
  const instance = await createTestInstance()
  instance.setState({
    ...instance.getState(),
    draft: 'keep this draft',
    modelPickerOpen: true,
  })

  instance.handleModelPickerOutsideClick('model-picker-popup', undefined)
  expect(instance.getState().modelPickerOpen).toBe(true)
  instance.handleModelPickerOutsideClick('model:gpt-5.4', undefined)
  expect(instance.getState().modelPickerOpen).toBe(true)

  instance.handleModelPickerOutsideClick('composer', 'keep this draft')
  expect(instance.getState().modelPickerOpen).toBe(false)
  expect(instance.getState().draft).toBe('keep this draft')
  expect(getNodesByClass(instance.render(), 'Chat2ModelPicker')).toHaveLength(0)
  expect(
    getNodesByClass(instance.render(), 'ChatModelPickerHidden'),
  ).toHaveLength(0)

  instance.setState({ ...instance.getState(), modelPickerOpen: true })
  instance.handleModelPickerOutsideClick(undefined, undefined)

  expect(instance.getState().modelPickerOpen).toBe(false)
  expect(instance.getState().draft).toBe('keep this draft')
  expect(getNodesByClass(instance.render(), 'Chat2ModelPicker')).toHaveLength(0)
  expect(
    getNodesByClass(instance.render(), 'ChatModelPickerHidden'),
  ).toHaveLength(0)

  await dispatch(instance, { type: 'blur' })
  expect(instance.getState().modelPickerOpen).toBe(false)
  instance.dispose?.()
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
  expect(
    getNodesByClass(instance.render(), 'ChatModelPickerHidden'),
  ).toHaveLength(0)

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
    params: [
      'handleKeyDown',
      'event.key',
      'event.ctrlKey',
      'event.metaKey',
      'event.shiftKey',
    ],
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

test('keeps the final working duration above the completed response', async () => {
  jest.useFakeTimers()
  jest.setSystemTime(Date.parse('2026-07-15T12:05:00.000Z'))
  const task: ChatTask = {
    createdAt: '2026-07-15T12:00:00.000Z',
    events: [
      {
        id: 'event-user',
        text: 'Explain this change',
        timestamp: '2026-07-15T12:00:00.000Z',
        type: 'user-message',
      },
      {
        id: 'event-running',
        status: 'running',
        timestamp: '2026-07-15T12:00:00.000Z',
        type: 'status',
      },
      {
        id: 'event-assistant',
        text: 'Here is the explanation.',
        timestamp: '2026-07-15T12:00:02.000Z',
        type: 'assistant-message',
      },
      {
        id: 'event-completed',
        status: 'completed',
        timestamp: '2026-07-15T12:00:02.000Z',
        type: 'status',
      },
    ],
    id: 'completed-task',
    modelId: 'gpt-5.4',
    status: 'completed',
    title: 'Explain this change',
    updatedAt: '2026-07-15T12:00:02.000Z',
  }

  try {
    const instance = await createInstance(
      createViewContext({ selectedTaskId: task.id }),
      {
        ...createMockChatApi(),
        async getTask() {
          return task
        },
      },
    )
    const rendered = getText(instance.render() as readonly any[])

    expect(rendered).toContain('Worked for 2 seconds')
    expect(rendered.indexOf('Worked for 2 seconds')).toBeLessThan(
      rendered.indexOf('Here is the explanation.'),
    )
    instance.dispose?.()
  } finally {
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

test('keeps a new chat selected when the previous submission finishes', async () => {
  const api = createMockChatApi()
  const tasks = await api.listTasks(1)
  const task = tasks[0]
  const completed = Promise.withResolvers<ChatTask>()
  const started = Promise.withResolvers<void>()
  const instance = await createInstance(undefined, {
    ...api,
    createTask: async () => {
      started.resolve()
      return completed.promise
    },
  })
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Start a task',
  })
  const submission = instance.submit()
  await started.promise
  await instance.newChat()
  completed.resolve(task)
  await submission

  expect(instance.getState().selectedTask).toBeUndefined()
  expect(instance.renderTitle()).toBe('Chat 2')
  instance.dispose?.()
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
    streamingText:
      'Streaming **bold** and unmatched ** plus [unfinished](https://example.com',
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
    expect(getText(dom)).toContain(
      'Streaming \nbold\n and unmatched ** plus [unfinished](',
    )
    expect(getNodesByClass(dom, 'ChatMessageLink')).toHaveLength(2)
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
    expect(getNodesByClass(dom, 'ChatLoginTitle')[0]).toEqual(
      expect.objectContaining({ type: VirtualDomElements.H1 }),
    )
    expect(getText(dom)).toContain('Log in')
    expect(getNodesByClass(dom, 'ChatLoginContent')).toHaveLength(1)
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
    expect(getNodesByClass(instance.render(), 'ChatLoginError')[0]).toEqual(
      expect.objectContaining({ role: 'alert' }),
    )
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
    expect(getText(instance.render())).toContain('Logging in…')
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

test('focus layout classes track new conversations and place one fade above changes', async () => {
  const instance = await createTestInstance()
  const state = instance.getState() as { focusMode: boolean }
  state.focusMode = true
  const emptyDom = instance.render()
  expect(getNodesByClass(emptyDom, 'ChatConversationBodyEmpty')).toHaveLength(1)
  expect(getNodesByClass(emptyDom, 'ChatMessagesEmpty')).toHaveLength(1)
  expect(getNodesByClass(emptyDom, 'ChatComposerFade')).toHaveLength(0)

  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Make a scoped change',
  })
  await instance.submit()
  const activeDom = instance.render()
  expect(getNodesByClass(activeDom, 'ChatConversationBodyEmpty')).toHaveLength(
    0,
  )
  expect(getNodesByClass(activeDom, 'ChatMessagesActive')).toHaveLength(1)
  expect(getNodesByClass(activeDom, 'ChatComposerAreaActive')).toHaveLength(1)
  expect(getNodesByClass(activeDom, 'ChatComposerFade')).toEqual(
    getNodesByClass(activeDom, 'ChatChanges'),
  )

  const submittedState = instance.getState()
  const task = submittedState.selectedTask!
  instance.setState({
    ...submittedState,
    selectedTask: {
      ...task,
      events: task.events.filter((event) => event.type !== 'changes'),
    },
  })
  const withoutChanges = instance.render()
  expect(getNodesByClass(withoutChanges, 'ChatComposerFade')).toEqual(
    getNodesByClass(withoutChanges, 'ChatComposerArea'),
  )

  instance.setState({ ...instance.getState(), selectedTask: undefined })
  const newConversation = instance.render()
  expect(getNodesByClass(newConversation, 'ChatMessagesEmpty')).toHaveLength(1)
  expect(getNodesByClass(newConversation, 'ChatComposerFade')).toHaveLength(0)
})

test('/status opens above the composer without creating a turn and closes with Escape', async () => {
  const api = createMockChatApi(0)
  const createTask = jest.fn(api.createTask)
  const instance = await createInstance(undefined, { ...api, createTask })
  const initialTasks = instance.getState().tasks
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: ' /status ',
  })
  await instance.submit()
  expect(createTask).not.toHaveBeenCalled()
  expect(instance.getState().tasks).toEqual(initialTasks)
  expect(instance.getState().draft).toBe('')
  const dom = instance.render()
  expect(getText(dom)).toContain('No session yet')
  expect(getText(dom)).toContain('Unavailable')
  expect(
    dom.findIndex((node: any) => node.className === 'ChatStatusPopup'),
  ).toBeLessThan(
    dom.findIndex((node: any) => node.className === 'ChatComposer'),
  )
  instance.handleKeyDown('Escape')
  expect(getNodesByClass(instance.render(), 'ChatStatusPopup')).toHaveLength(0)
  instance.dispose?.()
})

test('/status shows session context and authoritative allowance, and normal messages still send', async () => {
  const api = createMockChatApi(0)
  const task = await api.createTask('First message', 'gpt-5.6-luna')
  const getTask = async (id: string) => {
    const saved = await api.getTask(id)
    return (
      saved && {
        ...saved,
        contextUsage: {
          inputTokens: 1200,
          modelId: saved.modelId,
          outputTokens: 50,
        },
      }
    )
  }
  const getAllowance = jest.fn(async () => ({
    windows: [
      {
        label: 'Weekly limit',
        limit: 1000,
        remaining: 650,
        resetAt: '2026-11-12T00:00:00Z',
      },
    ],
  }))
  const sendMessage = jest.fn(api.sendMessage)
  const instance = await createInstance(undefined, {
    ...api,
    getAllowance,
    getTask,
    sendMessage,
  })
  await dispatch(instance, { name: `task:${task.id}`, type: 'click' })
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: '/status',
  })
  await instance.submit()
  expect(sendMessage).not.toHaveBeenCalled()
  expect(getText(instance.render())).toContain(task.id)
  expect(getText(instance.render())).toContain('1,250 tokens used')
  expect(getText(instance.render())).toContain('65% left')
  await dispatch(instance, { name: 'close-status', type: 'click' })
  expect(getNodesByClass(instance.render(), 'ChatStatusPopup')).toHaveLength(0)
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Follow up',
  })
  await instance.submit()
  expect(sendMessage).toHaveBeenCalledTimes(1)
  instance.dispose?.()
})

test('late allowance results cannot reopen status after switching sessions or closing', async () => {
  const api = createMockChatApi(0)
  const pending = Promise.withResolvers<{ windows: readonly [] }>()
  const instance = await createInstance(undefined, {
    ...api,
    getAllowance: () => pending.promise,
  })
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: '/status',
  })
  const submission = instance.submit()
  await flushPromises()
  expect(getText(instance.render())).toContain('Loading usage allowance')
  await instance.newChat()
  pending.resolve({ windows: [] })
  await submission
  expect(instance.getState().statusPopup).toBeUndefined()
  instance.dispose?.()
})

test('status reports allowance errors with retry guidance', async () => {
  const api = createMockChatApi(0)
  const getAllowance = jest
    .fn<NonNullable<typeof api.getAllowance>>()
    .mockRejectedValue(new Error('Offline'))
  const instance = await createInstance(undefined, { ...api, getAllowance })
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: '/status',
  })
  await instance.submit()
  expect(getText(instance.render())).toContain('Run /status to retry')
  instance.dispose?.()
})

test('late status requests cannot reopen a dismissed popup', async () => {
  const api = createMockChatApi(0)
  const pending = Promise.withResolvers<{ windows: readonly [] }>()
  const instance = await createInstance(undefined, {
    ...api,
    getAllowance: () => pending.promise,
  })
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: '/status',
  })
  const submission = instance.submit()
  await flushPromises()
  await dispatch(instance, { name: 'close-status', type: 'click' })
  pending.resolve({ windows: [] })
  await submission
  expect(instance.getState().statusPopup).toBeUndefined()
  instance.dispose?.()
})

test('status from a previous model is hidden after a model change', async () => {
  const api = createMockChatApi(0)
  const instance = await createInstance(undefined, api)
  const [firstModel, secondModel] = instance.getState().models
  if (!firstModel || !secondModel) throw new Error('Expected two mock models')
  instance.setState({ ...instance.getState(), selectedModelId: firstModel.id })
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: '/status',
  })
  await instance.submit()
  expect(getNodesByClass(instance.render(), 'ChatStatusPopup')).toHaveLength(1)
  instance.setState({ ...instance.getState(), selectedModelId: secondModel.id })
  expect(getNodesByClass(instance.render(), 'ChatStatusPopup')).toHaveLength(0)
  instance.dispose?.()
})

test.each(['new-chat', 'paste', 'restored-state'] as const)(
  'preserves native composer edits until an explicit %s draft change',
  async (change) => {
    const instance = await createInstance(undefined, createMockChatApi())
    try {
      await dispatch(instance, {
        name: 'composer',
        type: 'input',
        value: 'Native draft',
      })
      const nativeDom = instance.render()
      const nativeInput = getNodesByClass(nativeDom, 'ChatComposerInput')[0]
      expect(instance.getState().draft).toBe('Native draft')
      expect(nativeInput.value).toBeUndefined()
      // The renderer's focus restoration must resolve the textarea, not its form.
      expect(nativeDom.find((node) => node.name === 'composer')).toBe(
        nativeInput,
      )
      let expected: string
      if (change === 'new-chat') {
        await instance.newChat()
        expected = ''
      } else if (change === 'paste') {
        await instance.handleImagePaste([], ' Pasted', 12, 12)
        expected = 'Native draft Pasted'
      } else {
        instance.setState({ ...instance.getState(), draft: 'Restored draft' })
        expected = 'Restored draft'
      }
      expect(instance.getState().draft).toBe(expected)
      expect(
        getNodesByClass(instance.render(), 'ChatComposerInput')[0].value,
      ).toBe(expected)
    } finally {
      instance.dispose?.()
    }
  },
)

test('submit command targets the focused composer instead of a later hidden instance', async () => {
  const focusedApi = createMockChatApi()
  const hiddenApi = createMockChatApi()
  const focusedCreate = jest.spyOn(focusedApi, 'createTask')
  const hiddenCreate = jest.spyOn(hiddenApi, 'createTask')
  const focused = await createInstance(undefined, focusedApi)
  const hidden = await createInstance(undefined, hiddenApi)
  try {
    await dispatch(hidden, {
      name: 'composer',
      type: 'input',
      value: 'Hidden draft',
    })
    await dispatch(hidden, { name: 'composer', type: 'blur' })
    await dispatch(focused, { name: 'composer', type: 'focus' })
    await dispatch(focused, {
      name: 'composer',
      type: 'input',
      value: 'Visible draft',
    })
    await submitActiveChatViewInstance()
    expect(focusedCreate).toHaveBeenCalledTimes(1)
    expect(hiddenCreate).not.toHaveBeenCalled()
    expect(hidden.getState().draft).toBe('Hidden draft')
  } finally {
    focused.dispose?.()
    hidden.dispose?.()
  }
})

test('new chat command remembers the last composer after focus moves away', async () => {
  const first = await createTestInstance()
  const second = await createTestInstance()
  try {
    await dispatch(second, {
      name: 'composer',
      type: 'input',
      value: 'Other draft',
    })
    await dispatch(second, { name: 'composer', type: 'blur' })
    await dispatch(first, { name: 'composer', type: 'focus' })
    await dispatch(first, {
      name: 'composer',
      type: 'input',
      value: 'Active draft',
    })
    await dispatch(first, { name: 'composer', type: 'blur' })
    await newChatInActiveChatViewInstance()
    expect(first.getState().draft).toBe('')
    expect(second.getState().draft).toBe('Other draft')
  } finally {
    first.dispose?.()
    second.dispose?.()
  }
})
