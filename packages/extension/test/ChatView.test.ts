import type { ViewEvent } from '@lvce-editor/api'
import { expect, test } from '@jest/globals'
import { createInstance } from '../src/parts/ChatView/CreateInstance.ts'
import { mockResponse } from '../src/parts/MockChatApi/MockChatApi.ts'

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
  return dom.filter((node) => {
    return node.className?.split(' ').includes(className)
  })
}

const dispatch = async (
  instance: Awaited<ReturnType<typeof createInstance>>,
  event: ViewEvent,
): Promise<void> => {
  await instance.handleEvent?.(event)
}

test('renders at most 20 past tasks and a composer', async () => {
  const instance = await createInstance()
  const dom = instance.render() as readonly any[]

  expect(getNodesByClass(dom, 'ChatTaskButton')).toHaveLength(20)
  expect(dom).toContainEqual(
    expect.objectContaining({
      className: 'ChatComposerInput',
      name: 'composer',
      placeholder: 'Ask for follow-up changes',
    }),
  )
  expect(dom).toContainEqual(
    expect.objectContaining({
      className: 'ChatSubmitButton',
      name: 'submit',
    }),
  )
})

test('submits through the shared submit action and opens the detail view', async () => {
  const instance = await createInstance()
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
  expect(instance.renderTitle()).toBe('Chat 2: Build a smaller chat view')
  expect(instance.getState().draft).toBe('')
})

test('submits with the Send button', async () => {
  const instance = await createInstance()
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: 'Submit from a button',
  })
  await dispatch(instance, {
    name: 'submit',
    type: 'click',
  })

  expect(getText(instance.render() as readonly any[])).toContain(
    'Submit from a button',
  )
  expect(instance.getState().selectedTask).toBeDefined()
})

test('does not submit an empty message', async () => {
  const instance = await createInstance()
  await dispatch(instance, {
    name: 'composer',
    type: 'input',
    value: ' '.repeat(3),
  })
  await dispatch(instance, {
    name: 'submit',
    type: 'click',
  })

  expect(instance.getState().selectedTask).toBeUndefined()
})

test('opens a mock task and returns to the task list', async () => {
  const instance = await createInstance()
  await dispatch(instance, {
    name: 'task:mock-task-1',
    type: 'click',
  })
  expect(instance.getState().selectedTask?.title).toBe(
    'Add worker memory usage',
  )

  await dispatch(instance, {
    name: 'back',
    type: 'click',
  })
  expect(instance.getState().selectedTask).toBeUndefined()
})
