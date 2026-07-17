import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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
    return []
  }
  const result = /** @type {{ tools?: readonly unknown[] }} */ (value)
  return Array.isArray(result.tools) ? result.tools : []
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
  return client.request('tools/call', { arguments: arguments_, name })
}

const getSkillInstructions = () => readFile(skillPath, 'utf8')

process.once('exit', () => client.stop())

export const commandMap = {
  'ComputerUse.callTool': callTool,
  'ComputerUse.getSkillInstructions': getSkillInstructions,
  'ComputerUse.listTools': listTools,
}
