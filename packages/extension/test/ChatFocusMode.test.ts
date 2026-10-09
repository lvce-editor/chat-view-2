import { expect, test } from '@jest/globals'
import type { ChatViewState } from '../src/parts/ChatView/ChatViewState.ts'
import { toggleFocusMode } from '../src/parts/ChatFocusMode/ChatFocusMode.ts'

const createState = (): ChatViewState => ({
  activityExpanded: false,
  aiNativeTheme: 'default',
  changesExpanded: false,
  composerFocused: false,
  composerImages: [],
  copiedMessageId: '',
  draft: '',
  errorMessage: '',
  focusMode: false,
  focusModeEnabled: true,
  fontFamily: 'inherit',
  fontSize: '13px',
  loginPending: false,
  loginRequired: false,
  modelPickerOpen: false,
  models: [],
  selectedModelId: '',
  selectedTask: undefined,
  sessionsVisible: false,
  tasks: [],
  workingSeconds: 0,
})

test('enters and leaves side bar focus mode', async () => {
  let state = createState()

  state = { ...state, focusMode: toggleFocusMode(state) }
  state = { ...state, focusMode: toggleFocusMode(state) }

  expect(state.focusMode).toBe(false)
})

test('does nothing while experimental focus mode is disabled', async () => {
  const state = {
    ...createState(),
    focusModeEnabled: false,
  }

  const focusMode = toggleFocusMode(state)

  expect(focusMode).toBe(false)
})
