import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.message-tables'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const tableText = [
    'Countries by population:',
    '',
    '| Country | Population |',
    '| :--- | ---: |',
    '| **India** | 1.46 billion |',
    '| China | https://example.com |',
    '| United States | 347 million |',
    '',
    'A literal <img src=x onerror=alert(1)> stays text.',
  ].join('\n')
  await Locator('textarea[name="composer"]').type(tableText)
  await Command.executeExtensionCommand('chat2.submit')

  const table = Locator('.ChatMessageUser .ChatMessageTable')
  const container = Locator('.ChatMessageUser .ChatMessageTableContainer')
  const headerCells = Locator('.ChatMessageUser .ChatMessageTable thead th')
  const bodyRows = Locator('.ChatMessageUser .ChatMessageTable tbody tr')
  const boldCountry = Locator('.ChatMessageUser .ChatMessageTable strong')
  const countryLink = Locator('.ChatMessageUser .ChatMessageTable a')
  const rightAlignedCell = Locator(
    '.ChatMessageUser .ChatMessageTableCell-right',
  )
  const injectedImage = Locator('.ChatMessageUser .ChatMessageText img')
  const messageText = Locator('.ChatMessageUser .ChatMessageText')
  await expect(table).toHaveCount(1)
  await expect(headerCells).toHaveCount(2)
  await expect(bodyRows).toHaveCount(3)
  await expect(boldCountry).toHaveText('India')
  await expect(countryLink).toHaveAttribute('href', 'https://example.com')
  await expect(rightAlignedCell.first()).toHaveCSS('text-align', 'right')
  await expect(container).toHaveCSS('overflow-x', 'auto')
  await expect(injectedImage).toHaveCount(0)
  await expect(messageText).toContainText(
    'A literal <img src=x onerror=alert(1)> stays text.',
  )
}
