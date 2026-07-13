/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { ViewEvent } from '@lvce-editor/api'
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

test('renders a focused task list, model control, and composer', async () => {
  const instance = await createTestInstance()
  const dom = instance.render() as readonly any[]

  expect(getNodesByClass(dom, 'ChatTaskButton')).toHaveLength(20)
  expect(dom).toContainEqual(
    expect.objectContaining({
      className: 'ChatComposerInput',
      name: 'composer',
      placeholder: 'Describe a programming task',
    }),
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
      style: '--ChatTaskFontSize: 20px',
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
        style: '--ChatTaskFontSize: 13px',
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

test('submits a task and shows the compact result and change summary above the composer', async () => {
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
  expect(getText(dom)).toContain('5 files changed')
  expect(getText(dom)).toContain('+51')
  expect(getText(dom)).toContain('-10')
  expect(getText(dom)).toContain('Review')
  expect(getNodesByClass(dom, 'ChatChangedFile')).toHaveLength(0)
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
    value: 'Show the changed files',
  })
  await instance.submit()
  await dispatch(instance, { name: 'toggle-changes', type: 'click' })

  const dom = instance.render() as readonly any[]
  expect(getNodesByClass(dom, 'ChatChangedFile')).toHaveLength(5)
  expect(getText(dom)).toContain(
    'A  packages/e2e/src/chat2.virtual-dom-view.changed-files.ts',
  )
  expect(getText(dom)).toContain('2 checks passed')
  expect(getText(dom)).toContain('Hide')
})

test('renders message metadata and copies a message', async () => {
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
  expect(getNodesByClass(dom, 'ChatMessageMetadata')).toHaveLength(2)
  expect(getNodesByClass(dom, 'ChatMessageTimestamp')).toHaveLength(2)
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
  await new Promise((resolve) => setTimeout(resolve, 0))
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
