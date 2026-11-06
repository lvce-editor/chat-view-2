import { executeCommand, getPreference } from '@lvce-editor/api'
import type { ChatViewState } from '../ChatView/ChatViewState.ts'

type ExecuteCommand = (
  id: string,
  ...args: readonly unknown[]
) => Promise<unknown>

export const getFocusModeEnabled = async (): Promise<boolean> => {
  try {
    return (await getPreference('chat2.experimentalFocusMode')) !== false
  } catch {
    return false
  }
}

export const getFocusMode = async (
  execute: ExecuteCommand = executeCommand,
): Promise<boolean> => {
  try {
    return (await execute('Layout.getSideBarFocusMode')) === true
  } catch {
    return false
  }
}

// The host carries the requested layout alongside the next DOM render.
export const toggleFocusMode = (state: Readonly<ChatViewState>): boolean => {
  return state.focusModeEnabled ? !state.focusMode : state.focusMode
}
