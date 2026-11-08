import assert from 'node:assert/strict'
import type { Browser } from 'playwright'

export const testComposerPaste = async (
  browser: Browser,
  baseUrl: string,
): Promise<void> => {
  const context = await browser.newContext()
  try {
    await context.addInitScript(() => {
      localStorage.setItem(
        'settings',
        JSON.stringify({ 'chat2.useMockBackend': true }),
      )
    })
    const page = await context.newPage()
    await page.goto(`${baseUrl}chat/`)
    const composer = page.locator('textarea[name="composer"]')
    await composer.waitFor()
    await page.locator('.Workbench.AiNativeLayout').waitFor()
    const waitForDraft = async (expected: string): Promise<void> => {
      await page.waitForFunction(
        (value) =>
          globalThis.document.querySelector('textarea[name="composer"]')
            ?.value === value,
        expected,
        { timeout: 10_000 },
      )
    }
    const paste = async (
      text: string,
      start: number,
      end = start,
    ): Promise<void> => {
      // Seed the real clipboard through a native copy gesture in both browsers.
      await page.evaluate(() => {
        const source = globalThis.document.createElement('textarea')
        source.id = 'clipboard-source'
        globalThis.document.body.append(source)
      })
      const source = page.locator('#clipboard-source')
      await source.fill(text)
      await source.selectText()
      await page.keyboard.press('ControlOrMeta+C')
      await source.evaluate((element) => element.remove())
      await composer.focus()
      await composer.evaluate(
        (element, selection) =>
          element.setSelectionRange(selection.start, selection.end),
        { start, end },
      )
      await page.keyboard.press('ControlOrMeta+V')
    }

    await composer.fill('beforeafter')
    await paste(' middle ', 6)
    await waitForDraft('before middle after')
    await paste('first line\nsecond line', 7, 13)
    const expected = 'before first line\nsecond line after'
    await waitForDraft(expected)

    // A worker rerender and a reload must retain the pasted draft. Clicking
    // another control also proves subsequent events are no longer deadlocked.
    await page.locator('button[name="model-picker"]').click()
    await page.locator('.Chat2ModelPicker').waitFor()
    await composer.click()
    await page.locator('.Chat2ModelPicker').waitFor({ state: 'detached' })
    assert.equal(await composer.inputValue(), expected)
    await page.reload()
    await composer.waitFor()
    await waitForDraft(expected)
    await composer.evaluate((element) =>
      element.setSelectionRange(element.value.length, element.value.length),
    )
    await composer.focus()
    await page.keyboard.type('!')
    await waitForDraft(`${expected}!`)
    await page.locator('button[name="submit"]:not([disabled])').click()
    await page
      .locator('.ChatMessageUser')
      .filter({ hasText: expected })
      .waitFor()
    await waitForDraft('')
    assert.equal(await page.locator('.ChatMessageUser').count(), 1)
    assert.ok(
      (await page.locator('.ChatMessageUser').innerText()).includes(
        `${expected}!`,
      ),
    )
    process.stdout.write(
      'Native composer paste, replacement, reload and submission: pass\n',
    )
  } finally {
    await context.close()
  }
}
