import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.message-math'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type(
    'Prime: \\(2^{136,279,841}-1\\)\n\nDisplay: \\[\\frac{1}{2}\\]\n\n```tex\n$x^2$\n```',
  )
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('button[name="submit"]').click()

  const math = Locator('.ChatMessageUser .katex')
  const displayMath = Locator('.ChatMessageUser .katex-display')
  const code = Locator('.ChatMessageUser .ChatCodeBlock')
  const codeMath = Locator('.ChatMessageUser .ChatCodeBlock .katex')
  await expect(math).toHaveCount(2)
  await expect(displayMath).toHaveCSS('display', 'block')
  await expect(code).toContainText('$x^2$')
  await expect(codeMath).toHaveCount(0)
}
