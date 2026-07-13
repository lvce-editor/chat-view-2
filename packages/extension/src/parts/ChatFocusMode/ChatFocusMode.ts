import { executeCommand, getPreference } from '@lvce-editor/api'
import type { ChatViewState } from '../ChatView/ChatViewState.ts'

type ExecuteCommand = (
  id: string,
  ...args: readonly unknown[]
) => Promise<unknown>

export const getFocusModeEnabled = async (): Promise<boolean> => {
  try {
    return (await getPreference('chat2.experimentalFocusMode')) === true
  } catch {
    return false
  }
}

export const getFocusMode = async (): Promise<boolean> => {
  try {
    return (await executeCommand('Layout.getSideBarFocusMode')) === true
  } catch {
    return false
  }
}

export const toggleFocusMode = async (
  state: Readonly<ChatViewState>,
  execute: ExecuteCommand = executeCommand,
): Promise<boolean> => {
  if (!state.focusModeEnabled) {
    return state.focusMode
  }
  const focusMode = !state.focusMode
  await execute(
    focusMode ? 'Layout.enterSideBarFocusMode' : 'Layout.leaveSideBarFocusMode',
  )
  return focusMode
}
