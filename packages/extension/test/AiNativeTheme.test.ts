import { expect, jest, test } from '@jest/globals'
import {
  aiNativeThemePreference,
  normalizeAiNativeTheme,
  readAiNativeTheme,
} from '../src/parts/ChatView/AiNativeTheme.ts'

test('supports the three built-in AI-native themes', () => {
  expect(normalizeAiNativeTheme('default')).toBe('default')
  expect(normalizeAiNativeTheme('openai')).toBe('openai')
  expect(normalizeAiNativeTheme('claude')).toBe('claude')
})

test('falls back to the default theme for unknown or unavailable preferences', async () => {
  expect(normalizeAiNativeTheme('unknown')).toBe('default')
  await expect(readAiNativeTheme(async () => 'unknown')).resolves.toBe(
    'default',
  )
  await expect(
    readAiNativeTheme(async () => {
      throw new Error('preference unavailable')
    }),
  ).resolves.toBe('default')
})

test('reads the persisted AI-native theme preference', async () => {
  const readPreference = jest.fn(async (_key: string) => 'claude')
  await expect(readAiNativeTheme(readPreference)).resolves.toBe('claude')
  expect(readPreference).toHaveBeenCalledWith(aiNativeThemePreference)
})
