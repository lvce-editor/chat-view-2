import { getPreference } from '@lvce-editor/api'

export const defaultFontSize = '13px'
export const fontSizePreference = 'chat2.fontSize'

const fontSizeKeywords = new Set([
  'large',
  'larger',
  'math',
  'medium',
  'small',
  'smaller',
  'x-large',
  'x-small',
  'xx-large',
  'xx-small',
  'xxx-large',
])

const fontSizeUnits = new Set(['%', 'em', 'pt', 'px', 'rem'])

const fontSizePattern = /^(\d+(?:\.\d+)?|\.\d+)([a-z%]+)$/i

export type ReadPreference = (key: string) => Promise<unknown>

export const normalizeFontSize = (value: unknown): string => {
  if (typeof value !== 'string') {
    return defaultFontSize
  }
  const normalized = value.trim()
  const lowerCase = normalized.toLowerCase()
  if (normalized === '0' || fontSizeKeywords.has(lowerCase)) {
    return normalized
  }
  const match = fontSizePattern.exec(normalized)
  const unit = match?.[2]
  if (!unit || !fontSizeUnits.has(unit.toLowerCase())) {
    return defaultFontSize
  }
  return normalized
}

export const readFontSize = async (
  readPreference: ReadPreference = getPreference,
): Promise<string> => {
  try {
    return normalizeFontSize(await readPreference(fontSizePreference))
  } catch {
    return defaultFontSize
  }
}
