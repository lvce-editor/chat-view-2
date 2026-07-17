import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const computerUsePackage = join(
  packageRoot,
  'node_modules',
  '@agent-sh',
  'computer-use-linux',
)
const computerUseWrapper = join(
  computerUsePackage,
  'npm',
  'bin',
  'computer-use-linux.js',
)
const skillPath = join(
  computerUsePackage,
  'skills',
  'computer-use-linux',
  'SKILL.md',
)
const protocolVersion = '2024-11-05'
const maximumErrorCharacters = 16_000
const desktopIdRegex = /^[\w.+-]+(?:\.desktop)?$/u
const supportedUriProtocols = new Set(['file:', 'http:', 'https:'])
const xdotoolButtonNumbers = new Map([
  ['left', 1],
  ['middle', 2],
  ['right', 3],
])
const screenshotArgumentNames = new Set([
  'app_id',
  'format',
  'full_screen',
  'max_bytes',
  'max_height',
  'max_width',
  'pid',
  'quality',
  'raise_window',
  'scale',
  'title',
  'window_id',
  'wm_class',
])
const nativeToolGuidance = new Map([
  [
    'click',
    'When x/y come from a window-targeted screenshot, pass that same window_id and relative true so the screenshot coordinates are interpreted relative to the window.',
  ],
  [
    'press_key',
    'Do not use keyboard shortcuts to open an installed application; use launch_app instead.',
  ],
  [
    'screenshot',
    'This returns an image to the model but does not save a file; use save_screenshot when the user requests an output path.',
  ],
  [
    'type_text',
    'Do not type an application name into a desktop launcher; use launch_app instead.',
  ],
])

/**
 * @typedef {object} ScreenshotWriteOptions
 * @property {string} [homeDirectory]
 * @property {boolean} [overwrite]
 * @property {(path: string, bytes: Uint8Array, options: { flag: string }) => Promise<void>} [write]
 */

const supplementalTools = [
  {
    annotations: { openWorldHint: true },
    description:
      'Open an installed Linux desktop application. Use this instead of keyboard shortcuts or typing into an application launcher. Optionally open HTTP, HTTPS, or file URIs. For example, use desktop_id "google-chrome" to open Google Chrome.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        desktop_id: {
          description:
            'Desktop file id without a path, for example "google-chrome".',
          minLength: 1,
          type: 'string',
        },
        uris: {
          default: [],
          items: { minLength: 1, type: 'string' },
          type: 'array',
        },
      },
      required: ['desktop_id'],
      type: 'object',
    },
    name: 'launch_app',
  },
  {
    annotations: { destructiveHint: true },
    description:
      'Capture the Linux desktop or a targeted window and write the screenshot to a file. This is the screenshot tool to use whenever the user requests a saved image. The path must be absolute and inside the current user home directory. Existing files are preserved unless overwrite is explicitly true.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        app_id: { type: 'string' },
        format: { enum: ['jpeg', 'png'], type: 'string' },
        full_screen: { type: 'boolean' },
        max_bytes: { minimum: 1, type: 'integer' },
        max_height: { minimum: 1, type: 'integer' },
        max_width: { minimum: 1, type: 'integer' },
        overwrite: { default: false, type: 'boolean' },
        path: {
          description:
            'Absolute output path inside the current user home directory.',
          minLength: 1,
          type: 'string',
        },
        pid: { minimum: 0, type: 'integer' },
        quality: { maximum: 95, minimum: 1, type: 'integer' },
        raise_window: { type: 'boolean' },
        scale: { exclusiveMinimum: 0, maximum: 1, type: 'number' },
        title: { type: 'string' },
        window_id: { minimum: 0, type: 'integer' },
        wm_class: { type: 'string' },
      },
      required: ['path'],
      type: 'object',
    },
    name: 'save_screenshot',
  },
]

/**
 * @param {Record<string, unknown>} tool
 * @returns {Record<string, unknown>}
 */
const addNativeToolGuidance = (tool) => {
  const guidance =
    typeof tool.name === 'string' ? nativeToolGuidance.get(tool.name) : ''
  if (!guidance) {
    return tool
  }
  const description =
    typeof tool.description === 'string' && tool.description
      ? `${tool.description} `
      : ''
  return {
    ...tool,
    description: `${description}${guidance}`,
  }
}

/**
 * @param {readonly Record<string, unknown>[]} tools
 * @returns {readonly Record<string, unknown>[]}
 */
export const addSupplementalTools = (tools) => {
  const names = new Set(
    tools.flatMap((tool) =>
      tool &&
      typeof tool === 'object' &&
      'name' in tool &&
      typeof tool.name === 'string'
        ? [tool.name]
        : [],
    ),
  )
  return [
    ...supplementalTools.filter((tool) => !names.has(tool.name)),
    ...tools.map(addNativeToolGuidance),
  ]
}

/** @param {string} text */
const textResult = (text) => ({
  content: [{ text, type: 'text' }],
})

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * @param {unknown} value
 * @returns {value is { data: string, mimeType?: unknown, type: 'image' }}
 */
const isImageContent = (value) =>
  isRecord(value) && value.type === 'image' && typeof value.data === 'string'

/**
 * @param {unknown} value
 * @returns {value is { text: string }}
 */
const isTextContent = (value) =>
  isRecord(value) && typeof value.text === 'string'

/**
 * @param {unknown} value
 * @returns {string}
 */
const validateDesktopId = (value) => {
  if (typeof value !== 'string' || !desktopIdRegex.test(value)) {
    throw new TypeError('desktop_id must be a desktop file id without a path')
  }
  return value.endsWith('.desktop') ? value : `${value}.desktop`
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
const validateUris = (value) => {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError('uris must be an array of URI strings')
  }
  for (const uri of value) {
    let parsed
    try {
      parsed = new URL(uri)
    } catch {
      throw new TypeError(`Invalid application URI: ${uri}`)
    }
    if (!supportedUriProtocols.has(parsed.protocol)) {
      throw new TypeError(`Unsupported application URI protocol: ${uri}`)
    }
  }
  return value
}

/**
 * @param {string} desktopId
 * @param {string[]} uris
 * @returns {Promise<void>}
 */
const defaultLaunchApplication = (desktopId, uris) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('gtk-launch', [desktopId, ...uris], {
      detached: true,
      stdio: 'ignore',
    })
    child.once('error', rejectPromise)
    child.once('spawn', () => {
      child.unref()
      resolvePromise()
    })
  })

/**
 * @param {string[]} arguments_
 * @returns {Promise<void>}
 */
const defaultRunXdotool = (arguments_) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('xdotool', arguments_, { stdio: 'ignore' })
    child.once('error', rejectPromise)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(
        new Error(`xdotool exited (${signal ?? code ?? 'unknown'})`),
      )
    })
  })

/**
 * @param {Record<string, unknown>} arguments_
 * @param {(desktopId: string, uris: string[]) => Promise<void>} [launch]
 */
export const launchApplication = async (
  arguments_,
  launch = defaultLaunchApplication,
) => {
  const desktopId = validateDesktopId(arguments_.desktop_id)
  const uris = validateUris(arguments_.uris)
  await launch(desktopId, uris)
  return textResult(
    `Launched desktop application ${desktopId}${uris.length > 0 ? ` with ${uris.join(', ')}` : ''}.`,
  )
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
const validateCoordinate = (value, name) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`)
  }
  return value
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {number | undefined}
 */
const validateOptionalInteger = (value, name) => {
  if (value === undefined || value === null) {
    return undefined
  }
  return validateCoordinate(value, name)
}

/** @param {unknown} value */
const getWindowList = (value) => {
  if (
    !isRecord(value) ||
    !isRecord(value.structuredContent) ||
    value.structuredContent.backend !== 'x11' ||
    !Array.isArray(value.structuredContent.windows)
  ) {
    return []
  }
  return value.structuredContent.windows
}

/**
 * Use XTEST on X11 when available. The computer-use absolute uinput backend can
 * be miscalibrated by Xorg and report a successful click at the wrong pixel.
 *
 * @param {Record<string, unknown>} arguments_
 * @param {{ listWindows: () => Promise<unknown>, run?: (arguments_: string[]) => Promise<void> }} dependencies
 * @returns {Promise<undefined | ReturnType<typeof textResult>>}
 */
export const clickWithXdotool = async (
  arguments_,
  { listWindows, run = defaultRunXdotool },
) => {
  if (arguments_.x === undefined || arguments_.y === undefined) {
    return undefined
  }
  const x = validateCoordinate(arguments_.x, 'x')
  const y = validateCoordinate(arguments_.y, 'y')
  const windowId = validateOptionalInteger(arguments_.window_id, 'window_id')
  const clickCount =
    validateOptionalInteger(arguments_.click_count, 'click_count') || 1
  const button = arguments_.button ?? 'left'
  if (typeof button !== 'string' || !xdotoolButtonNumbers.has(button)) {
    return undefined
  }

  const windows = getWindowList(await listWindows())
  if (windows.length === 0) {
    return undefined
  }
  const window =
    windowId === undefined
      ? undefined
      : windows.find((item) => isRecord(item) && item.window_id === windowId)
  if (windowId !== undefined && !isRecord(window)) {
    throw new Error(`Computer-use window ${windowId} was not found`)
  }
  const bounds = window && isRecord(window.bounds) ? window.bounds : undefined
  if (arguments_.relative === true && !bounds) {
    throw new Error('A window_id is required for a relative click')
  }
  const absoluteX =
    x + (bounds ? validateCoordinate(bounds.x, 'window bounds x') : 0)
  const absoluteY =
    y + (bounds ? validateCoordinate(bounds.y, 'window bounds y') : 0)
  const commandArguments = []
  if (windowId !== undefined) {
    commandArguments.push('windowactivate', '--sync', `${windowId}`)
  }
  commandArguments.push(
    'mousemove',
    '--sync',
    `${absoluteX}`,
    `${absoluteY}`,
    'click',
    '--repeat',
    `${clickCount}`,
    `${xdotoolButtonNumbers.get(button)}`,
  )
  try {
    await run(commandArguments)
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  return textResult(
    `Clicked ${button} at desktop coordinates ${absoluteX},${absoluteY} using the X11 input backend.`,
  )
}

/** @param {Record<string, unknown>} arguments_ */
const getScreenshotArguments = (arguments_) =>
  Object.fromEntries(
    Object.entries(arguments_).filter(
      ([name, value]) =>
        screenshotArgumentNames.has(name) && value !== undefined,
    ),
  )

/** @param {unknown} value */
const getScreenshotImage = (value) => {
  if (!isRecord(value)) {
    throw new Error('Computer-use screenshot returned an invalid result')
  }
  const content = /** @type {unknown[]} */ (
    Array.isArray(value.content) ? value.content : []
  )
  const image = content.find(isImageContent)
  if (!image) {
    const detail = content
      .filter(isTextContent)
      .map((item) => item.text)
      .join('\n')
    throw new Error(detail || 'Computer-use screenshot returned no image')
  }
  const bytes = Buffer.from(image.data, 'base64')
  if (bytes.length === 0) {
    throw new Error('Computer-use screenshot returned an empty image')
  }
  return { bytes, mimeType: image.mimeType || 'image/png' }
}

/**
 * @param {unknown} requestedPath
 * @param {string} [homeDirectory]
 */
export const resolveScreenshotPath = (
  requestedPath,
  homeDirectory = process.env.HOME || homedir(),
) => {
  if (typeof requestedPath !== 'string' || !isAbsolute(requestedPath)) {
    throw new TypeError('Screenshot path must be absolute')
  }
  const resolvedHome = resolve(homeDirectory)
  const resolvedPath = resolve(requestedPath)
  const relativePath = relative(resolvedHome, resolvedPath)
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    relativePath.startsWith('..\\') ||
    isAbsolute(relativePath)
  ) {
    throw new Error('Screenshot path must stay inside the current user home')
  }
  return resolvedPath
}

/**
 * @param {unknown} value
 * @param {unknown} requestedPath
 * @param {ScreenshotWriteOptions} [options]
 */
export const saveScreenshotImage = async (
  value,
  requestedPath,
  {
    homeDirectory = process.env.HOME || homedir(),
    overwrite = false,
    write = writeFile,
  } = {},
) => {
  const path = resolveScreenshotPath(requestedPath, homeDirectory)
  const { bytes, mimeType } = getScreenshotImage(value)
  await write(path, bytes, { flag: overwrite ? 'w' : 'wx' })
  return textResult(
    `Saved ${mimeType} screenshot to ${path} (${bytes.length} bytes).`,
  )
}

/**
 * @param {NodeJS.ProcessEnv} environment
 * @returns {NodeJS.ProcessEnv}
 */
export const getComputerUseEnvironment = (environment) => ({
  ...environment,
  ELECTRON_RUN_AS_NODE: '1',
})

class ComputerUseMcpClient {
  buffer = ''
  /** @type {import('node:child_process').ChildProcessWithoutNullStreams | undefined} */
  child = undefined
  /** @type {Promise<void> | undefined} */
  connectPromise = undefined
  errorOutput = ''
  nextRequestId = 1
  /** @type {Map<number, { reject: (reason?: unknown) => void, resolve: (value: unknown) => void }>} */
  pending = new Map()

  /** @param {string} chunk */
  appendError(chunk) {
    this.errorOutput = `${this.errorOutput}${chunk}`.slice(
      -maximumErrorCharacters,
    )
  }

  /** @param {unknown} error */
  failPending(error) {
    for (const { reject } of this.pending.values()) {
      reject(error)
    }
    this.pending.clear()
  }

  /** @param {string} line */
  handleLine(line) {
    if (!line.trim()) {
      return
    }
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (!message || typeof message !== 'object' || !('id' in message)) {
      return
    }
    const request = this.pending.get(message.id)
    if (!request) {
      return
    }
    this.pending.delete(message.id)
    if ('error' in message && message.error) {
      const detail =
        typeof message.error.message === 'string'
          ? message.error.message
          : JSON.stringify(message.error)
      request.reject(new Error(detail))
      return
    }
    request.resolve(message.result)
  }

  /** @param {string} chunk */
  handleOutput(chunk) {
    this.buffer += chunk
    while (true) {
      const newline = this.buffer.indexOf('\n')
      if (newline === -1) {
        return
      }
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      this.handleLine(line)
    }
  }

  /** @param {string} method */
  sendNotification(method) {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`)
  }

  /**
   * @param {string} method
   * @param {unknown} params
   * @returns {Promise<unknown>}
   */
  sendRequest(method, params) {
    const child = this.child
    if (!child) {
      return Promise.reject(new Error('Computer-use MCP server is not running'))
    }
    const id = this.nextRequestId++
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve })
    })
    child.stdin.write(
      `${JSON.stringify({ id, jsonrpc: '2.0', method, params })}\n`,
    )
    return result
  }

  async connect() {
    if (this.connectPromise) {
      return this.connectPromise
    }
    this.connectPromise = this.start()
    try {
      await this.connectPromise
    } catch (error) {
      this.connectPromise = undefined
      throw error
    }
  }

  async start() {
    if (process.platform !== 'linux') {
      throw new Error('Computer use is available only on Linux')
    }
    const child = spawn(process.execPath, [computerUseWrapper, 'mcp'], {
      env: getComputerUseEnvironment(process.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => this.handleOutput(chunk))
    child.stderr.on('data', (chunk) => this.appendError(chunk))
    child.on('error', (error) => this.failPending(error))
    child.on('exit', (code, signal) => {
      this.child = undefined
      this.connectPromise = undefined
      const detail = this.errorOutput.trim()
      this.failPending(
        new Error(
          `Computer-use MCP server exited (${signal ?? code ?? 'unknown'})${detail ? `: ${detail}` : ''}`,
        ),
      )
    })
    await this.sendRequest('initialize', {
      capabilities: {},
      clientInfo: { name: 'lvce-chat-view-2', version: '1.0.0' },
      protocolVersion,
    })
    this.sendNotification('notifications/initialized')
  }

  /**
   * @param {string} method
   * @param {unknown} params
   * @returns {Promise<unknown>}
   */
  async request(method, params) {
    await this.connect()
    return this.sendRequest(method, params)
  }

  stop() {
    this.child?.kill()
    this.child = undefined
    this.connectPromise = undefined
  }
}

const client = new ComputerUseMcpClient()

const listTools = async () => {
  const value = await client.request('tools/list', {})
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return supplementalTools
  }
  const result = /** @type {{ tools?: readonly unknown[] }} */ (value)
  const tools = Array.isArray(result.tools) ? result.tools : []
  return addSupplementalTools(tools)
}

/**
 * @param {string} name
 * @param {unknown} arguments_
 */
const callTool = async (name, arguments_) => {
  if (typeof name !== 'string' || !name) {
    throw new TypeError('Computer-use tool name must be a non-empty string')
  }
  if (
    !arguments_ ||
    typeof arguments_ !== 'object' ||
    Array.isArray(arguments_)
  ) {
    throw new TypeError('Computer-use tool arguments must be an object')
  }
  const toolArguments = /** @type {Record<string, unknown>} */ (arguments_)
  if (name === 'launch_app') {
    return launchApplication(toolArguments)
  }
  if (name === 'save_screenshot') {
    const value = await client.request('tools/call', {
      arguments: getScreenshotArguments(toolArguments),
      name: 'screenshot',
    })
    return saveScreenshotImage(value, toolArguments.path, {
      overwrite: toolArguments.overwrite === true,
    })
  }
  if (name === 'click') {
    const result = await clickWithXdotool(toolArguments, {
      listWindows: () =>
        client.request('tools/call', { arguments: {}, name: 'list_windows' }),
    })
    if (result) {
      return result
    }
  }
  return client.request('tools/call', { arguments: toolArguments, name })
}

const getSkillInstructions = () => readFile(skillPath, 'utf8')

process.once('exit', () => client.stop())

export const commandMap = {
  'ComputerUse.callTool': callTool,
  'ComputerUse.getSkillInstructions': getSkillInstructions,
  'ComputerUse.listTools': listTools,
}
