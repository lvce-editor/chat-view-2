import { getPreference } from '@lvce-editor/api'
import type { ReadPreference } from './FontSize.ts'

export const aiNativeThemePreference = 'chat2.aiNativeTheme'

export type AiNativeTheme = 'default' | 'openai' | 'claude'

const themes = new Set<AiNativeTheme>(['default', 'openai', 'claude'])

export const normalizeAiNativeTheme = (value: unknown): AiNativeTheme => {
  return typeof value === 'string' && themes.has(value as AiNativeTheme)
    ? (value as AiNativeTheme)
    : 'default'
}

export const readAiNativeTheme = async (
  readPreference: ReadPreference = getPreference,
): Promise<AiNativeTheme> => {
  try {
    return normalizeAiNativeTheme(await readPreference(aiNativeThemePreference))
  } catch {
    return 'default'
  }
}
