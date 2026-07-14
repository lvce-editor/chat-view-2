import { expect, jest, test } from '@jest/globals'
import type { ChatViewState } from '../src/parts/ChatView/ChatViewState.ts'
import { toggleFocusMode } from '../src/parts/ChatFocusMode/ChatFocusMode.ts'

const createState = (): ChatViewState => ({
  activityExpanded: false,
  changesExpanded: false,
  composerFocused: false,
  copiedMessageId: '',
  draft: '',
  errorMessage: '',
  focusMode: false,
  focusModeEnabled: true,
  fontFamily: 'inherit',
  fontSize: '13px',
  modelPickerOpen: false,
  models: [],
  selectedModelId: '',
  selectedTask: undefined,
  tasks: [],
})

test('enters and leaves side bar focus mode', async () => {
  const execute = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
  const state = createState()

  state.focusMode = await toggleFocusMode(state, execute)
  state.focusMode = await toggleFocusMode(state, execute)

  expect(execute.mock.calls).toEqual([
    ['Layout.enterSideBarFocusMode'],
    ['Layout.leaveSideBarFocusMode'],
  ])
  expect(state.focusMode).toBe(false)
})

test('does nothing while experimental focus mode is disabled', async () => {
  const execute = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
  const state = {
    ...createState(),
    focusModeEnabled: false,
  }

  const focusMode = await toggleFocusMode(state, execute)

  expect(execute).not.toHaveBeenCalled()
  expect(focusMode).toBe(false)
})
