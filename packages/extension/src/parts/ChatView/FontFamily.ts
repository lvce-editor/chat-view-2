import { getPreference } from '@lvce-editor/api'
import type { ReadPreference } from './FontSize.ts'

export const defaultFontFamily = 'inherit'
export const fontFamilyPreference = 'chat2.fontFamily'

const unsafeFontFamilyPattern = /[;{}\r\n]/

export const normalizeFontFamily = (value: unknown): string => {
  if (typeof value !== 'string') {
    return defaultFontFamily
  }
  const normalized = value.trim()
  if (!normalized || unsafeFontFamilyPattern.test(normalized)) {
    return defaultFontFamily
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
