/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { ViewEvent } from '@lvce-editor/api'
import { expect, test } from '@jest/globals'
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

const createTestInstance = async (delayMs = 0) => {
  return createInstance(undefined, createMockChatApi(delayMs))
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

test('submits a task and shows the compact result and change summary', async () => {
  const instance = await createTestInstance()
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Build a smaller chat view',
  })
  await instance.submit()

  const dom = instance.render() as readonly any[]
  expect(getNodesByClass(dom, 'ChatDetailView')).toHaveLength(1)
  expect(getText(dom)).toContain('Build a smaller chat view')
  expect(getText(dom)).toContain(mockResponse)
  expect(getText(dom)).toContain('Changed 1 file · 2 checks passed')
  expect(instance.renderTitle()).toBe('Chat 2: Build a smaller chat view')
  expect(instance.getState().draft).toBe('')
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
