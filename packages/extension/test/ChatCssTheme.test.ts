import { expect, test } from '@jest/globals'
import { readFile } from 'node:fs/promises'

const singleClassSelectorPattern = /^\.[\w-]+(?::[\w:-]+(?:\(:disabled\))?)*$/u

const readChatCss = async (): Promise<string> => {
  return readFile(new URL('../media/chat.css', import.meta.url), 'utf8')
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

test('chat styles use single class selectors without structural nesting', async () => {
  const css = await readChatCss()
  const ruleParts = css.split('{').slice(0, -1)
  for (const part of ruleParts) {
    const selectorList = part.slice(part.lastIndexOf('}') + 1).trim()
    if (selectorList.startsWith('@') || selectorList === 'to') {
      continue
    }
    for (const selector of selectorList.split(',')) {
      expect(selector.trim()).toMatch(singleClassSelectorPattern)
    }
  }
})
