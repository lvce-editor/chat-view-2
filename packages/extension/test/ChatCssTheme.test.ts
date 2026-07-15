import { expect, test } from '@jest/globals'
import { readFile } from 'node:fs/promises'

const readChatCss = async (): Promise<string> => {
  return readFile(new URL('../chat.css', import.meta.url), 'utf8')
}

test('chat messages use a theme-aware native scrollbar', async () => {
  const css = await readChatCss()

  expect(css).toContain('--ChatScrollbarThumb: var(')
  expect(css).toContain('--vscode-scrollbarSlider-background')
  expect(css).toContain('--EditorScrollBarBackground')
  expect(css).toContain('--ChatScrollbarTrack: var(--ChatBackground);')
  expect(css).toContain(
    'scrollbar-color: var(--ChatScrollbarThumb) var(--ChatScrollbarTrack);',
  )
  expect(css).toContain('.ChatMessages::-webkit-scrollbar-thumb {')
  expect(css).toContain('.ChatMessages::-webkit-scrollbar-thumb:hover {')
  expect(css).toContain('.ChatMessages::-webkit-scrollbar-thumb:active {')
})
