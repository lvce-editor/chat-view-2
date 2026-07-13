import type { Test } from '@lvce-editor/test-with-playwright'
import {
  createBoards,
  createMockData,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.credentials'
// export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  let step = 'start'
  try {
    step = 'create boards'
    const boards = createBoards(1)
    const mockData = createMockData(boards)
    step = 'reset'
    step = 'use mock data'
    await Command.executeExtensionCommand('trello.test.useMockData', mockData)
    step = 'show trello'
    await Command.executeExtensionCommand('trello.show')

    step = 'locate inputs'
    const apiKeyInput = Locator('input[name="apiKey"]')
    const tokenInput = Locator('input[name="token"]')
    step = 'expect inputs'
    await expect(apiKeyInput).toBeVisible()
    await expect(tokenInput).toBeVisible()

    step = 'locate labels'
    const apiKey = Locator('text=API key')
    const token = Locator('text=Token')

    step = 'expect labels'
    await expect(apiKey).toBeVisible()
    await expect(token).toBeVisible()
  } catch (error) {
    throw new Error(`credentials failed at ${step}: ${error}`)
  }
}
