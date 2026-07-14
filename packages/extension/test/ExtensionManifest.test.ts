import { expect, test } from '@jest/globals'
import { readFile } from 'node:fs/promises'

test('maps Enter in the composer to the submit command', async () => {
  const manifestUrl = new URL('../extension.json', import.meta.url)
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))

  expect(manifest.keybindings).toContainEqual({
    command: 'chat2.submit',
    key: 'Enter',
    when: 'chat2.composerFocus',
  })
  expect(manifest.activation).toContain('onCommand:chat2.submit')
})

test('contributes the headless chat commands for browser evaluations', async () => {
  const manifestUrl = new URL('../extension.json', import.meta.url)
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))

  for (const id of [
    'chat2.createSession',
    'chat2.runPrompt',
    'chat2.sendMessage',
  ]) {
    expect(manifest.commands).toContainEqual(expect.objectContaining({ id }))
    expect(manifest.activation).toContain(`onCommand:${id}`)
  }
})

test('keeps experimental focus mode disabled by default', async () => {
  const manifestUrl = new URL('../extension.json', import.meta.url)
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))

  expect(manifest.configuration['chat2.experimentalFocusMode']).toEqual(
    expect.objectContaining({
      default: false,
      type: 'boolean',
    }),
  )
  expect(manifest.activation).toContain('onCommand:chat2.toggleFocusMode')
})

test('uses the full sidebar without the default header', async () => {
  const manifestUrl = new URL('../extension.json', import.meta.url)
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))

  expect(manifest.views).toContainEqual(
    expect.objectContaining({
      id: 'chat2.views.chat',
      showSideBarHeader: false,
    }),
  )
})
