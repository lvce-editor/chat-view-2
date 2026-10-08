import type { Test } from '@lvce-editor/test-with-playwright'

// cspell:ignore João Gonçalves Zarco
export const name = 'chat2.virtual-dom-view.message-headings'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type(
    '# Heading one\n## Heading two\n### João Gonçalves Zarco\n#### Heading four\n##### Heading five\n###### Heading six\n\n```md\n### Literal code heading\n```',
  )
  await Command.executeExtensionCommand('chat2.submit')

  const headings = Locator('.ChatMessageUser .ChatMessageHeading')
  const thirdHeading = Locator('.ChatMessageUser h3')
  const firstHeading = Locator('.ChatMessageUser h1')
  const sixthHeading = Locator('.ChatMessageUser h6')
  const codeBlock = Locator('.ChatMessageUser .ChatCodeBlock')
  const thirdHeadingStyle = headings.nth(2)
  await expect(headings).toHaveCount(6)
  await expect(thirdHeading).toHaveText('João Gonçalves Zarco')
  await expect(firstHeading).toHaveText('Heading one')
  await expect(sixthHeading).toHaveText('Heading six')
  await expect(codeBlock).toContainText('### Literal code heading')
  await expect(thirdHeadingStyle).toHaveCSS('font-size', '15.6px')
}
