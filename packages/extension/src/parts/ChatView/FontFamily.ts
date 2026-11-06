import { getPreference } from '@lvce-editor/api'
import type { ReadPreference } from './FontSize.ts'

export const defaultFontFamily = 'inherit'
export const fontFamilyPreference = 'chat2.fontFamily'
export const defaultAssistantMessageFontFamily =
  "Georgia, 'Times New Roman', serif"
export const defaultUserMessageFontFamily = 'sans-serif'
export const assistantMessageFontFamilyPreference =
  'chat2.assistantMessageFontFamily'
export const userMessageFontFamilyPreference = 'chat2.userMessageFontFamily'

const unsafeFontFamilyPattern = /[;{}\r\n]/

export const normalizeFontFamily = (
  value: unknown,
  fallback = defaultFontFamily,
): string => {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim()
  if (!normalized || unsafeFontFamilyPattern.test(normalized)) {
    return fallback
  }
  return normalized
}

export const readFontFamily = async (
  readPreference: ReadPreference = getPreference,
): Promise<string> => {
  try {
    return normalizeFontFamily(await readPreference(fontFamilyPreference))
  } catch {
    return defaultFontFamily
  }
}

export const readMessageFontFamily = async (
  preference: string,
  defaultValue: string,
  readPreference: ReadPreference = getPreference,
): Promise<string> => {
  try {
    return normalizeFontFamily(await readPreference(preference), defaultValue)
  } catch {
    return defaultValue
  }
}
