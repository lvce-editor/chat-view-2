/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { ViewContext, ViewEvent } from '@lvce-editor/api'
import { expect, jest, test } from '@jest/globals'
import { VirtualDomElements } from '@lvce-editor/virtual-dom-worker'
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

const dispatch = async (
  instance: Awaited<ReturnType<typeof createInstance>>,
  event: ViewEvent,
): Promise<void> => {
  await instance.handleEvent?.(event)
}

const createTestInstance = async (
  delayMs = 0,
  readPreference?: (key: string) => Promise<unknown>,
) => {
  return createInstance(undefined, createMockChatApi(delayMs), readPreference)
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

test('requests scrolling the messages to the bottom after every render', async () => {
  const instance = await createTestInstance()

  expect(instance.renderScrollPosition()).toEqual(['.ChatMessages', 9_999_999])
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
  expect(focusedDom).toContainEqual(
    expect.objectContaining({
      className: 'ChatFocusModeButton',
      title: 'Return to IDE layout',
    }),
  )
  expect(focusedDom[0]).toEqual(
    expect.objectContaining({
      className: 'ChatView ChatListView ChatFocusMode',
    }),
  )
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

test('opens the OpenAI model picker without adding model controls to the header', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, { name: 'model-picker', type: 'click' })

  const dom = instance.render() as readonly any[]
  expect(getNodesByClass(dom, 'ChatModelPicker')).toHaveLength(1)
  expect(getText(dom)).toContain('OpenAI models')
  expect(getText(dom)).toContain('GPT-5.4')
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
  await dispatch(instance, { name: 'stop', type: 'click' })
  await running

  expect(instance.getState().selectedTask?.status).toBe('completed')
  expect(getText(instance.render() as readonly any[])).toContain('Stopped.')
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
