import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  addSupplementalTools,
  clickWithXdotool,
  getComputerUseEnvironment,
  launchApplication,
  resolveScreenshotPath,
  saveScreenshotImage,
} from '../src/computerUseClient.js'

const desktopFileIdRegex = /desktop file id/
const doesNotSaveRegex = /does not save a file/
const existsErrorRegex = /EEXIST/
const launchResultRegex = /Launched desktop application/
const launchToolGuidanceRegex = /use launch_app instead/
const outsideHomeRegex = /must stay inside/
const relativeClickGuidanceRegex = /relative true/
const saveResultRegex = /Saved image\/png screenshot/
const unsupportedUriRegex = /Unsupported application URI protocol/
const x11ClickResultRegex = /using the X11 input backend/

test('runs the computer-use server as Node when hosted by Electron', () => {
  const environment = getComputerUseEnvironment({ HOME: '/home/test' })

  assert.deepEqual(environment, {
    ELECTRON_RUN_AS_NODE: '1',
    HOME: '/home/test',
  })
})

test('adds launch and save screenshot tools without replacing native tools', () => {
  const tools = addSupplementalTools([
    { name: 'doctor' },
    { description: 'native', name: 'save_screenshot' },
    { description: 'Click a point.', name: 'click' },
    { description: 'Press keys.', name: 'press_key' },
    { description: 'Capture an image.', name: 'screenshot' },
    { description: 'Type text.', name: 'type_text' },
  ])

  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'launch_app',
      'doctor',
      'save_screenshot',
      'click',
      'press_key',
      'screenshot',
      'type_text',
    ],
  )
  assert.equal(tools[2].description, 'native')
  assert.match(tools[3].description, relativeClickGuidanceRegex)
  assert.match(tools[4].description, launchToolGuidanceRegex)
  assert.match(tools[5].description, doesNotSaveRegex)
  assert.match(tools[6].description, launchToolGuidanceRegex)
})

test('launches a desktop application with validated uris', async () => {
  const calls = []
  const result = await launchApplication(
    {
      desktop_id: 'google-chrome',
      uris: ['https://github.com/microsoft/vscode'],
    },
    async (desktopId, uris) => {
      calls.push({ desktopId, uris })
    },
  )

  assert.deepEqual(calls, [
    {
      desktopId: 'google-chrome.desktop',
      uris: ['https://github.com/microsoft/vscode'],
    },
  ])
  assert.match(result.content[0].text, launchResultRegex)
})

test('rejects unsafe desktop application ids and uris', async () => {
  await assert.rejects(
    launchApplication({ desktop_id: '../google-chrome' }, async () => {}),
    desktopFileIdRegex,
  )
  await assert.rejects(
    launchApplication(
      { desktop_id: 'google-chrome', uris: ['javascript:alert(1)'] },
      async () => {},
    ),
    unsupportedUriRegex,
  )
})

test('clicks window screenshot coordinates with the X11 backend', async () => {
  const calls = []
  const result = await clickWithXdotool(
    {
      button: 'left',
      click_count: 2,
      relative: true,
      window_id: 42,
      x: 683,
      y: 553,
    },
    {
      listWindows: async () => ({
        structuredContent: {
          backend: 'x11',
          windows: [
            {
              bounds: { height: 915, width: 911, x: 10, y: 37 },
              window_id: 42,
            },
          ],
        },
      }),
      run: async (arguments_) => calls.push(arguments_),
    },
  )

  assert.deepEqual(calls, [
    [
      'windowactivate',
      '--sync',
      '42',
      'mousemove',
      '--sync',
      '693',
      '590',
      'click',
      '--repeat',
      '2',
      '1',
    ],
  ])
  assert.match(result.content[0].text, x11ClickResultRegex)
})

test('falls back when xdotool or X11 coordinate input is unavailable', async () => {
  const noCoordinates = await clickWithXdotool(
    { element_index: 1 },
    { listWindows: async () => assert.fail('must not list windows') },
  )
  const noX11 = await clickWithXdotool(
    { x: 1, y: 2 },
    {
      listWindows: async () => ({
        structuredContent: { backend: 'wayland', windows: [] },
      }),
    },
  )
  const missingXdotool = await clickWithXdotool(
    { x: 1, y: 2 },
    {
      listWindows: async () => ({
        structuredContent: {
          backend: 'x11',
          windows: [{ bounds: { x: 0, y: 0 }, window_id: 1 }],
        },
      }),
      run: async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      },
    },
  )

  assert.equal(noCoordinates, undefined)
  assert.equal(noX11, undefined)
  assert.equal(missingXdotool, undefined)
})

test('saves a screenshot inside the user home without overwriting', async (t) => {
  const homeDirectory = await mkdtemp(
    join(tmpdir(), 'chat-view-2-computer-use-'),
  )
  t.after(() => rm(homeDirectory, { force: true, recursive: true }))
  const path = join(homeDirectory, 'screenshot.png')
  const screenshot = {
    content: [
      {
        data: Buffer.from('image-bytes').toString('base64'),
        mimeType: 'image/png',
        type: 'image',
      },
    ],
  }

  const result = await saveScreenshotImage(screenshot, path, {
    homeDirectory,
  })

  assert.equal((await readFile(path)).toString(), 'image-bytes')
  assert.match(result.content[0].text, saveResultRegex)
  await assert.rejects(
    saveScreenshotImage(screenshot, path, { homeDirectory }),
    existsErrorRegex,
  )
})

test('rejects screenshot paths outside the user home', () => {
  assert.throws(
    () => resolveScreenshotPath('/tmp/screenshot.png', '/home/test'),
    outsideHomeRegex,
  )
})
