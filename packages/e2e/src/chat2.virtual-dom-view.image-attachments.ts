import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.image-attachments'

export const test: Test = async ({
  Command,
  ComponentState,
  expect,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  await expect(composer).toBeVisible()

  const components = await ComponentState.getComponents()
  const chatView = components.find(
    (component) => component.moduleId === 'ExtensionView',
  )
  if (!chatView) {
    throw new Error(
      'Expected the Chat 2 extension view component to be mounted',
    )
  }

  const state = await ComponentState.getState<Record<string, unknown>>(
    chatView.uid,
  )
  const image = {
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    mimeType: 'image/png',
    name: 'sample.png',
  }

  await ComponentState.setState(chatView.uid, {
    ...state,
    composerImages: [{ id: 'e2e-image', name: image.name, status: 'loading' }],
    draft: 'Describe this image',
  })

  const loadingImage = Locator('.ChatComposerImage-loading')
  const submit = Locator('button[name="submit"]')
  await expect(loadingImage).toBeVisible()
  await expect(loadingImage).toContainText('Loading image…')
  await expect(submit).toHaveJSProperty('disabled', true)

  await ComponentState.setState(chatView.uid, {
    ...state,
    composerImages: [
      {
        attachment: image,
        id: 'e2e-image',
        name: image.name,
        status: 'ready',
      },
    ],
    draft: 'Describe this image',
  })

  const composerPreview = Locator('.ChatComposerImagePreview')
  await expect(composerPreview).toBeVisible()
  await expect(composerPreview).toHaveAttribute('src', image.dataUrl)
  await expect(submit).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click -- submit the staged attachment through the Chat 2 UI
  await submit.click()

  const submittedImage = Locator('.ChatMessageUser .ChatMessageImage')
  const userMessage = Locator('.ChatMessageUser')
  await expect(submittedImage).toBeVisible()
  await expect(submittedImage).toHaveAttribute('alt', image.name)
  await expect(submittedImage).toHaveAttribute('src', image.dataUrl)
  await expect(userMessage).toContainText('Describe this image')
}
