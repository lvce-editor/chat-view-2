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
