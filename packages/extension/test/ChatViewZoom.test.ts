import { expect, test } from '@jest/globals'
import { getZoomCommand } from '../src/parts/ChatView/ChatViewZoom.ts'

test('maps Ctrl plus and minus key representations to workbench zoom commands', () => {
  expect(getZoomCommand('+', true, false, false)).toBe('Window.zoomIn')
  expect(getZoomCommand('=', true, false, true)).toBe('Window.zoomIn')
  expect(getZoomCommand('-', true, false, false)).toBe('Window.zoomOut')
  expect(getZoomCommand('_', true, false, true)).toBe('Window.zoomOut')
})

test('maps Command plus and minus and ignores unrelated keys', () => {
  expect(getZoomCommand('+', false, true, false)).toBe('Window.zoomIn')
  expect(getZoomCommand('-', false, true, false)).toBe('Window.zoomOut')
  expect(getZoomCommand('a', true, false, false)).toBeUndefined()
  expect(getZoomCommand('+', false, false, false)).toBeUndefined()
})
