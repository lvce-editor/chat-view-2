import { expect, test } from '@jest/globals'
import { readFile } from 'node:fs/promises'

const genericEditorVariablePattern =
  /var\(--(?:Foreground|ForegroundMuted|InputForeground|InputBackground|InputBorder|ButtonForeground|ButtonBackground|ButtonHoverBackground|EditorBackground|SideBarBackground|SideBarBorder|WidgetBorder|ToolbarHoverBackground|TextLinkForeground|ErrorForeground|ErrorBackground|MainBackground)/
const oldDarkFallbackPattern =
  /#(?:181f1f|202929|121818|111616|314040|334040|087d90|006a7a|4dc8ff|aeb8b8|f4f4f4|f7f7f7|394545|2a3434)\b/i
const hardcodedDarkOverlayPattern = /rgba\((?:0,\s*0,\s*0|255,\s*255,\s*255)/

const readTrelloCss = async (): Promise<string> => {
  return readFile(new URL('../trello.css', import.meta.url), 'utf8')
}

const getCssAfterTokenLayer = (css: string): string => {
  const endIndex = css.indexOf('}\n\n')
  if (endIndex === -1) {
    return css
  }
  return css.slice(endIndex + 3)
}

test('trello css defines local theme tokens from editor theme variables', async () => {
  const css = await readTrelloCss()

  expect(css).toContain('.TrelloView,\n.TrelloBoardDetail {')
  expect(css).toContain('--TrelloForeground: var(')
  expect(css).toContain('--WorkbenchForeground')
  expect(css).toContain('--ListForeground')
  expect(css).toContain('--SideBarForeground')
  expect(css).toContain('--TrelloSurface: var(')
  expect(css).toContain('--MainBackground')
  expect(css).toContain('--PanelBackground')
  expect(css).toContain('--WidgetBackground')
  expect(css).toContain('--InputBoxBackground')
  expect(css).toContain('--TrelloButtonBackground: var(')
  expect(css).toContain('--SplitButtonBackground')
  expect(css).toContain('--BadgeBackground')
  expect(css).toContain('--LinkForeground')
  expect(css).toContain('--TrelloScrollbarThumb: var(')
  expect(css).toContain('--vscode-scrollbarSlider-background')
  expect(css).toContain('--EditorScrollBarBackground')
  expect(css).toContain('--TrelloBorder: var(')
  expect(css).toContain('--ContrastBorder')
  expect(css).toContain('--InputBoxBorder')
})

test('trello scroll containers use native themed scrollbars', async () => {
  const css = await readTrelloCss()

  expect(css).toContain(
    '.TrelloLists,\n.TrelloCards,\n.TrelloCardDetailPanel {',
  )
  expect(css).toContain(
    'scrollbar-color: var(--TrelloScrollbarThumb) var(--TrelloScrollbarTrack);',
  )
})

test('trello component styles use local tokens instead of dark theme fallbacks', async () => {
  const css = await readTrelloCss()
  const componentCss = getCssAfterTokenLayer(css)

  expect(componentCss).not.toMatch(genericEditorVariablePattern)
  expect(css).not.toMatch(oldDarkFallbackPattern)
  expect(css).not.toMatch(hardcodedDarkOverlayPattern)
})

test('trello readable content allows text selection', async () => {
  const css = await readTrelloCss()

  expect(css).toContain('.TrelloTitle,\n.TrelloWelcome,')
  expect(css).toContain('.TrelloCardDescriptionPreview,')
  expect(css).toContain('.TrelloCardCommentText,')
  expect(css).toContain('user-select: text;')
})

test('trello card description preview uses pointer cursor', async () => {
  const css = await readTrelloCss()

  expect(css).toContain('.TrelloCardDescriptionPreview {')
  expect(css).toContain('cursor: pointer;')
})
