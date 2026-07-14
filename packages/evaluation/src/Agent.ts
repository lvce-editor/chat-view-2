/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types, regex/hoist-regex, sonarjs/cognitive-complexity, unicorn/max-nested-calls, unicorn/no-await-expression-member, unicorn/no-break-in-nested-loop, unicorn/no-declarations-before-early-exit, unicorn/prefer-code-point, unicorn/prefer-else-if, unicorn/prefer-iterator-to-array */
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface AgentToolCall {
  readonly arguments: string
  readonly callId: string
  readonly name: string
}

interface AgentToolDefinition {
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly name: string
}

interface AgentToolResult {
  readonly content: string
  readonly isError: boolean
}

interface ResponseEvent {
  readonly delta?: string
  readonly item?: {
    readonly arguments?: string
    readonly call_id?: string
    readonly id?: string
    readonly name?: string
    readonly type?: string
  }
  readonly response?: {
    readonly error?: { readonly message?: string }
    readonly id?: string
  }
  readonly type?: string
}

interface StepInputMessage {
  readonly content: string
  readonly role: 'user'
}

interface StepInputToolOutput {
  readonly callId: string
  readonly output: string
  readonly type: 'function-call-output'
}

type StepInput = StepInputMessage | StepInputToolOutput

interface StepResult {
  readonly responseId: string
  readonly toolCalls: readonly AgentToolCall[]
}

interface ToolArguments {
  readonly endLine?: number
  readonly expectedHash?: string
  readonly maxResults?: number
  readonly newText?: string
  readonly oldText?: string
  readonly path?: string
  readonly query?: string
  readonly startLine?: number
}

export interface RunAgentOptions {
  readonly backendOrigin: string
  readonly model: string
  readonly prompt: string
  readonly signal: AbortSignal
  readonly workspace: string
}

const ignoredDirectories = new Set([
  '.git',
  '.hg',
  '.svn',
  'coverage',
  'dist',
  'node_modules',
])
const maximumFileCharacters = 256_000
const maximumFilesToSearch = 500
const maximumSteps = 30

const definitions: readonly AgentToolDefinition[] = [
  {
    description:
      'Search UTF-8 workspace files for text. Returns bounded path, line, and preview matches.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        maxResults: { maximum: 100, minimum: 1, type: 'integer' },
        query: { minLength: 1, type: 'string' },
      },
      required: ['query'],
      type: 'object',
    },
    name: 'search_workspace',
  },
  {
    description:
      'Read a bounded line range from a UTF-8 file inside the workspace.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        endLine: { minimum: 1, type: 'integer' },
        path: { minLength: 1, type: 'string' },
        startLine: { minimum: 1, type: 'integer' },
      },
      required: ['path'],
      type: 'object',
    },
    name: 'read_file',
  },
  {
    description:
      'Atomically replace exactly one text occurrence in a workspace file. Pass an empty oldText only when creating a new file.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        expectedHash: { type: 'string' },
        newText: { type: 'string' },
        oldText: { type: 'string' },
        path: { minLength: 1, type: 'string' },
      },
      required: ['path', 'oldText', 'newText'],
      type: 'object',
    },
    name: 'apply_patch',
  },
]

const hashText = (value: string): string => {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const validateRelativePath = (path: string): string => {
  const normalized = path.replaceAll('\\', '/')
  const segments = normalized.split('/').filter(Boolean)
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes('://') ||
    segments.includes('..') ||
    segments.includes('.git')
  ) {
    throw new Error(`Path must stay inside the workspace: ${path}`)
  }
  return segments.join('/')
}

const resolveWorkspacePath = async (
  workspace: string,
  path: string,
): Promise<string> => {
  const relativePath = validateRelativePath(path)
  const segments = relativePath.split('/')
  let parent = workspace
  for (const segment of segments) {
    const candidate = join(parent, segment)
    try {
      if ((await lstat(candidate)).isSymbolicLink()) {
        throw new Error(
          `Symbolic links are not allowed in agent paths: ${path}`,
        )
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        break
      }
      throw error
    }
    parent = candidate
  }
  return join(workspace, relativePath)
}

const parseArguments = (value: string): ToolArguments => {
  const parsed: unknown = JSON.parse(value || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Tool arguments must be a JSON object')
  }
  return parsed
}

const success = (content: string): AgentToolResult => ({
  content,
  isError: false,
})

const failure = (error: unknown): AgentToolResult => ({
  content: error instanceof Error ? error.message : String(error),
  isError: true,
})

const searchWorkspace = async (
  workspace: string,
  query: string,
  maxResults: number,
  signal: AbortSignal,
): Promise<string> => {
  const directories = ['']
  const matches: string[] = []
  let visitedFiles = 0
  while (
    directories.length > 0 &&
    matches.length < maxResults &&
    visitedFiles < maximumFilesToSearch
  ) {
    signal.throwIfAborted()
    const directory = directories.shift() || ''
    const entries = (
      await readdir(join(workspace, directory), {
        withFileTypes: true,
      })
    ).toSorted((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const relativePath = directory ? `${directory}/${entry.name}` : entry.name
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
        directories.push(relativePath)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      visitedFiles++
      try {
        const content = await readFile(join(workspace, relativePath), 'utf8')
        if (content.length > maximumFileCharacters) {
          continue
        }
        const lines = content.split('\n')
        for (let index = 0; index < lines.length; index++) {
          if (!lines[index]?.toLowerCase().includes(query.toLowerCase())) {
            continue
          }
          matches.push(
            `${relativePath}:${index + 1}: ${lines[index]?.trim().slice(0, 240)}`,
          )
          if (matches.length >= maxResults) {
            break
          }
        }
      } catch {
        // Binary and unreadable files are skipped.
      }
    }
  }
  return matches.length > 0
    ? matches.join('\n')
    : `No matches for ${JSON.stringify(query)}`
}

const readWorkspaceFile = async (
  workspace: string,
  path: string,
  startLine = 1,
  endLine = startLine + 399,
): Promise<string> => {
  const content = await readFile(
    await resolveWorkspacePath(workspace, path),
    'utf8',
  )
  const lines = content.split('\n')
  const start = Math.max(1, startLine)
  const end = Math.min(lines.length, Math.max(start, endLine), start + 399)
  const body = lines
    .slice(start - 1, end)
    .map((line, index) => `${start + index}: ${line}`)
    .join('\n')
  return `${body}\n\n[hash ${hashText(content)}; lines ${start}-${end} of ${lines.length}]`
}

const applyPatch = async (
  workspace: string,
  path: string,
  oldText: string,
  newText: string,
  expectedHash?: string,
): Promise<string> => {
  const normalizedPath = validateRelativePath(path)
  const filePath = await resolveWorkspacePath(workspace, normalizedPath)
  let content = ''
  let exists = true
  try {
    content = await readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    exists = false
  }
  if (expectedHash && hashText(content) !== expectedHash) {
    throw new Error(`File changed since it was read: ${normalizedPath}`)
  }
  let updated: string
  if (!exists && oldText === '') {
    updated = newText
  } else {
    const firstIndex = content.indexOf(oldText)
    const lastIndex = content.lastIndexOf(oldText)
    if (firstIndex === -1) {
      throw new Error(`Text to replace was not found in ${normalizedPath}`)
    }
    if (firstIndex !== lastIndex) {
      throw new Error(`Text to replace is not unique in ${normalizedPath}`)
    }
    updated = `${content.slice(0, firstIndex)}${newText}${content.slice(firstIndex + oldText.length)}`
  }
  await writeFile(filePath, updated)
  return `Updated ${normalizedPath} [hash ${hashText(updated)}]`
}

const executeTool = async (
  workspace: string,
  call: AgentToolCall,
  signal: AbortSignal,
): Promise<AgentToolResult> => {
  try {
    signal.throwIfAborted()
    const arguments_ = parseArguments(call.arguments)
    if (call.name === 'search_workspace') {
      if (typeof arguments_.query !== 'string' || !arguments_.query) {
        throw new TypeError('search_workspace requires query')
      }
      return success(
        await searchWorkspace(
          workspace,
          arguments_.query,
          Math.min(100, Math.max(1, arguments_.maxResults ?? 40)),
          signal,
        ),
      )
    }
    if (call.name === 'read_file') {
      if (typeof arguments_.path !== 'string') {
        throw new TypeError('read_file requires path')
      }
      return success(
        await readWorkspaceFile(
          workspace,
          arguments_.path,
          arguments_.startLine,
          arguments_.endLine,
        ),
      )
    }
    if (call.name === 'apply_patch') {
      if (
        typeof arguments_.path !== 'string' ||
        typeof arguments_.oldText !== 'string' ||
        typeof arguments_.newText !== 'string'
      ) {
        throw new TypeError('apply_patch requires path, oldText, and newText')
      }
      return success(
        await applyPatch(
          workspace,
          arguments_.path,
          arguments_.oldText,
          arguments_.newText,
          arguments_.expectedHash,
        ),
      )
    }
    throw new Error(`Unknown tool: ${call.name}`)
  } catch (error) {
    return failure(error)
  }
}

const mapInput = (input: StepInput): Readonly<Record<string, unknown>> => {
  if ('output' in input) {
    return {
      call_id: input.callId,
      output: input.output,
      type: 'function_call_output',
    }
  }
  return {
    content: [{ text: input.content, type: 'input_text' }],
    role: input.role,
  }
}

const getErrorMessage = async (response: Response): Promise<string> => {
  try {
    const value = (await response.json()) as {
      readonly error?: { readonly message?: string }
      readonly message?: string
    }
    return value.error?.message || value.message || response.statusText
  } catch {
    return response.statusText
  }
}

const readEvents = async (
  response: Response,
  signal: AbortSignal,
): Promise<StepResult> => {
  if (!response.body) {
    throw new Error('The response stream was empty')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const toolCalls = new Map<string, AgentToolCall>()
  let buffer = ''
  let responseId = ''

  const handleEvent = (event: ResponseEvent): void => {
    const { item } = event
    if (
      event.type === 'response.output_item.done' &&
      item?.type === 'function_call' &&
      item.name
    ) {
      const callId = item.call_id || item.id || `call-${toolCalls.size + 1}`
      toolCalls.set(callId, {
        arguments: item.arguments || '{}',
        callId,
        name: item.name,
      })
    }
    if (event.type === 'response.completed') {
      responseId = event.response?.id || responseId
    }
    if (event.type === 'response.failed' || event.type === 'error') {
      throw new Error(
        event.response?.error?.message || 'The model request failed',
      )
    }
  }

  while (true) {
    signal.throwIfAborted()
    const result = await reader.read()
    buffer += decoder.decode(result.value, { stream: !result.done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    for (const block of blocks) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (data && data !== '[DONE]') {
        handleEvent(JSON.parse(data) as ResponseEvent)
      }
    }
    if (result.done) {
      break
    }
  }
  if (buffer.trim()) {
    const data = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (data && data !== '[DONE]') {
      handleEvent(JSON.parse(data) as ResponseEvent)
    }
  }
  return { responseId, toolCalls: [...toolCalls.values()] }
}

const runStep = async (
  backendOrigin: string,
  model: string,
  input: readonly StepInput[],
  previousResponseId: string,
  signal: AbortSignal,
): Promise<StepResult> => {
  const response = await fetch(`${backendOrigin}/v1/responses`, {
    body: JSON.stringify({
      input: input.map(mapInput),
      instructions:
        'You are the Lvce coding agent. Inspect relevant files before editing. Keep changes scoped, use tools to modify the workspace, run available verification, and end with a concise result.',
      model,
      ...(previousResponseId && { previous_response_id: previousResponseId }),
      stream: true,
      tools: definitions.map((tool) => ({
        description: tool.description,
        name: tool.name,
        parameters: tool.inputSchema,
        type: 'function',
      })),
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal,
  })
  if (!response.ok) {
    throw new Error(
      `Model request failed (${response.status}): ${await getErrorMessage(response)}`,
    )
  }
  return readEvents(response, signal)
}

export const runAgent = async (options: RunAgentOptions): Promise<void> => {
  let input: readonly StepInput[] = [
    {
      content: `Workspace: .\n\nUser task:\n${options.prompt}`,
      role: 'user',
    },
  ]
  let previousResponseId = ''
  for (let step = 0; step < maximumSteps; step++) {
    options.signal.throwIfAborted()
    const result = await runStep(
      options.backendOrigin,
      options.model,
      input,
      previousResponseId,
      options.signal,
    )
    previousResponseId = result.responseId || previousResponseId
    if (result.toolCalls.length === 0) {
      return
    }
    const outputs: AgentToolResult[] = []
    for (const call of result.toolCalls) {
      outputs.push(await executeTool(options.workspace, call, options.signal))
    }
    input = result.toolCalls.map((call, index) => ({
      callId: call.callId,
      output: outputs[index]?.content || 'Tool did not return a result',
      type: 'function-call-output' as const,
    }))
  }
  throw new Error(`Agent stopped after ${maximumSteps} steps`)
}
