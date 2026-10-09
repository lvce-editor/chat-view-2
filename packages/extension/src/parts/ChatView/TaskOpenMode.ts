import { getPreference } from '@lvce-editor/api'
import type { ReadPreference } from './FontSize.ts'

export const taskOpenModePreference = 'chat2.taskOpenMode'

export type TaskOpenMode = 'click' | 'mousedown'

export const normalizeTaskOpenMode = (value: unknown): TaskOpenMode => {
  return value === 'click' ? 'click' : 'mousedown'
}

export const readTaskOpenMode = async (
  readPreference: ReadPreference = getPreference,
): Promise<TaskOpenMode> => {
  try {
    return normalizeTaskOpenMode(await readPreference(taskOpenModePreference))
  } catch {
    return 'mousedown'
  }
}
