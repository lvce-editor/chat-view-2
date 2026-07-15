/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types, sonarjs/cognitive-complexity, unicorn/max-nested-calls, unicorn/no-break-in-nested-loop, unicorn/no-declarations-before-early-exit, unicorn/prefer-code-point, unicorn/prefer-iterator-to-array */
import {
  exists,
  getWorkspaceUri,
  readDirWithFileTypes,
  readFile,
  remove,
  writeFile,
} from '@lvce-editor/api'
import type { ChatChangedFile } from '../ChatApi/ChatApi.ts'
import definitions from './AgentToolDefinitions.json' with { type: 'json' }

export interface AgentToolDefinition {
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly name: string
}

export interface AgentToolCall {
  readonly arguments: string
  readonly callId: string
  readonly name: string
}

export interface AgentToolResult {
  readonly content: string
  readonly isError: boolean
}

export interface AgentCommandOptions {
  readonly onOutput: (chunk: string) => void
  readonly outputLimit: number
  readonly signal?: AbortSignal
  readonly timeoutMs: number
}

export interface AgentCommandResult {
  readonly exitCode: number
  readonly output: string
}

export interface AgentCommandSandbox {
  readonly execute: (
    command: string,
    options: AgentCommandOptions,
  ) => Promise<AgentCommandResult>
}

export interface AgentEditorContext {
  readonly activeFile?: string
  readonly diagnostics?: readonly string[]
  readonly selection?: string
}

export interface AgentEditorContextProvider {
  readonly getContext: () => Promise<AgentEditorContext>
}

export interface AgentVerificationResult {
  readonly checksPassed: number
  readonly failed: boolean
  readonly output: string
}

export interface AgentFileSystemAccess {
  readonly allowRead: boolean
  readonly allowWrite: boolean
  readonly root: '.'
}

export interface AgentToolHostOptions {
  readonly commandSandbox?: AgentCommandSandbox
  readonly editorContextProvider?: AgentEditorContextProvider
  readonly fileSystemAccess?: AgentFileSystemAccess
  readonly workspaceUriProvider?: () => Promise<string>
}

export interface AgentToolHost {
  readonly beginTurn: (taskId: string) => void
  readonly execute: (
    call: AgentToolCall,
    signal?: AbortSignal,
  ) => Promise<AgentToolResult>
  readonly getChangedFiles: () => readonly ChatChangedFile[]
  readonly getDefinitions: () => readonly AgentToolDefinition[]
  readonly getWorkspaceContext: () => Promise<string>
  readonly revert: () => Promise<readonly ChatChangedFile[]>
  readonly verifyChanges?: (
    signal?: AbortSignal,
  ) => Promise<AgentVerificationResult>
}

interface FileSnapshot {
  readonly appliedContent: string
  readonly content: string
  readonly existed: boolean
  readonly uri: string
}

interface ToolArguments {
  readonly command?: string
  readonly endLine?: number
  readonly expectedHash?: string
  readonly maxResults?: number
  readonly newText?: string
  readonly oldText?: string
  readonly query?: string
  readonly startLine?: number
  readonly uri?: string
}

const directoryType = 3
const fileType = 7
const symlinkTypes = new Set([9, 10, 11])
const maximumFileCharacters = 256_000
const maximumFilesToSearch = 500
const ignoredDirectories = new Set([
  '.git',
  '.hg',
  '.svn',
  'coverage',
  'dist',
  'node_modules',
])
const readToolNames = new Set([
  'get_workspace_uri',
  'read_file',
  'search_workspace',
])
const writeToolNames = new Set(['apply_patch'])

export const workspaceContextLabel =
  'Workspace file tools use absolute URIs. Call get_workspace_uri before read_file or apply_patch, and only use URIs inside that workspace.'

const parseArguments = (value: string): ToolArguments => {
  const parsed: unknown = JSON.parse(value || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Tool arguments must be a JSON object')
  }
  return parsed
}

const getWorkspaceBase = async (
  workspaceUriProvider: () => Promise<string>,
): Promise<string> => {
  const workspace = await workspaceUriProvider()
  if (!workspace) {
    throw new Error('Open a workspace before running a coding task')
  }
  let url: URL
  try {
    url = new URL(workspace)
  } catch {
    throw new Error(`Workspace URI is invalid: ${workspace}`)
  }
  if (url.search || url.hash) {
    throw new Error(`Workspace URI is invalid: ${workspace}`)
  }
  if (!url.pathname.endsWith('/')) {
    url.pathname += '/'
  }
  return url.href
}

export const getWorkspaceRelativePath = (
  workspaceUri: string,
  uri: string,
): string => {
  const base = new URL(workspaceUri)
  const target = new URL(uri)
  if (
    target.search ||
    target.hash ||
    target.protocol !== base.protocol ||
    target.host !== base.host ||
    !target.href.startsWith(base.href)
  ) {
    throw new Error(`URI must stay inside the workspace: ${uri}`)
  }
  const encodedPath = target.href.slice(base.href.length)
  const segments = encodedPath.split('/').filter(Boolean)
  const decodedSegments = segments.map((segment) => decodeURIComponent(segment))
  if (
    !encodedPath ||
    decodedSegments.includes('.git') ||
    decodedSegments.some(
      (segment) => segment.includes('/') || segment.includes('\\'),
    )
  ) {
    throw new Error(`URI must stay inside the workspace: ${uri}`)
  }
  return decodedSegments.join('/')
}

const toWorkspaceUri = (workspaceUri: string, relativePath: string): string => {
  const encodedPath = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return new URL(encodedPath, workspaceUri).href
}

const getLines = (text: string): readonly string[] => {
  if (!text) {
    return []
  }
  const lines = text.split('\n')
  if (text.endsWith('\n')) {
    lines.pop()
  }
  return lines
}

export const getLineChanges = (
  oldText: string,
  newText: string,
): Readonly<{ additions: number; deletions: number }> => {
  const oldLines = getLines(oldText)
  const newLines = getLines(newText)
  let prefix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++
  }
  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - suffix - 1] ===
      newLines[newLines.length - suffix - 1]
  ) {
    suffix++
  }
  return {
    additions: newLines.length - prefix - suffix,
    deletions: oldLines.length - prefix - suffix,
  }
}

const resolveWorkspaceUri = async (
  uri: string,
  workspaceUriProvider: () => Promise<string>,
): Promise<Readonly<{ relativePath: string; uri: string }>> => {
  const base = await getWorkspaceBase(workspaceUriProvider)
  const relativePath = getWorkspaceRelativePath(base, uri)
  const segments = relativePath.split('/')
  let parent = base
  for (const segment of segments) {
    const entries = await readDirWithFileTypes(parent)
    const entry = entries.find((item) => item.name === segment)
    if (!entry) {
      break
    }
    if (symlinkTypes.has(entry.type)) {
      throw new Error(`Symbolic links are not allowed in agent URIs: ${uri}`)
    }
    parent = toWorkspaceUri(parent, `${segment}/`)
  }
  return { relativePath, uri: new URL(uri).href }
}

const hashText = (value: string): string => {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const success = (content: string): AgentToolResult => ({
  content,
  isError: false,
})

const failure = (error: unknown): AgentToolResult => ({
  content: error instanceof Error ? error.message : String(error),
  isError: true,
})

export const createAgentToolHost = ({
  commandSandbox,
  editorContextProvider,
  fileSystemAccess,
  workspaceUriProvider = getWorkspaceUri,
}: AgentToolHostOptions = {}): AgentToolHost => {
  if (fileSystemAccess && fileSystemAccess.root !== '.') {
    throw new Error(
      `Unsupported agent sandbox root: ${fileSystemAccess.root}. Only "." is supported.`,
    )
  }
  const allowRead =
    fileSystemAccess === undefined ||
    fileSystemAccess.allowRead ||
    fileSystemAccess.allowWrite
  const allowWrite =
    fileSystemAccess === undefined || fileSystemAccess.allowWrite
  let changedFiles = new Map<string, ChatChangedFile>()
  let snapshots = new Map<string, FileSnapshot>()
  const availableDefinitions = definitions.filter((definition) => {
    if (readToolNames.has(definition.name)) {
      return allowRead
    }
    if (writeToolNames.has(definition.name)) {
      return allowWrite
    }
    if (definition.name === 'run_command') {
      return Boolean(commandSandbox)
    }
    if (definition.name === 'get_diagnostics') {
      return Boolean(editorContextProvider)
    }
    return true
  })

  const searchWorkspace = async (
    query: string,
    maxResults: number,
    signal?: AbortSignal,
  ): Promise<string> => {
    const workspace = await getWorkspaceBase(workspaceUriProvider)
    const directories = ['']
    const matches: string[] = []
    let visitedFiles = 0
    while (
      directories.length > 0 &&
      matches.length < maxResults &&
      visitedFiles < maximumFilesToSearch
    ) {
      signal?.throwIfAborted()
      const directory = directories.shift() || ''
      const entries = await readDirWithFileTypes(
        toWorkspaceUri(workspace, directory),
      )
      for (const entry of entries) {
        const relativePath = directory
          ? `${directory}/${entry.name}`
          : entry.name
        if (
          entry.type === directoryType &&
          !ignoredDirectories.has(entry.name)
        ) {
          directories.push(relativePath)
          continue
        }
        if (entry.type !== fileType) {
          continue
        }
        visitedFiles++
        try {
          const uri = toWorkspaceUri(workspace, relativePath)
          const content = await readFile(uri)
          if (content.length > maximumFileCharacters) {
            continue
          }
          const lines = content.split('\n')
          for (let index = 0; index < lines.length; index++) {
            if (!lines[index]?.toLowerCase().includes(query.toLowerCase())) {
              continue
            }

            matches.push(
              `${uri}:${index + 1}: ${lines[index]?.trim().slice(0, 240)}`,
            )
            if (matches.length >= maxResults) {
              break
            }
          }
        } catch {
          // Binary, unreadable, and concurrently removed files are skipped.
        }
      }
    }
    return matches.length > 0
      ? matches.join('\n')
      : `No matches for ${JSON.stringify(query)}`
  }

  const readWorkspaceFile = async (
    uri: string,
    startLine = 1,
    endLine = startLine + 399,
  ): Promise<string> => {
    const target = await resolveWorkspaceUri(uri, workspaceUriProvider)
    const content = await readFile(target.uri)
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
    uri: string,
    oldText: string,
    newText: string,
    expectedHash?: string,
  ): Promise<string> => {
    const target = await resolveWorkspaceUri(uri, workspaceUriProvider)
    const existed = await exists(target.uri)
    const content = existed ? await readFile(target.uri) : ''
    if (expectedHash && hashText(content) !== expectedHash) {
      throw new Error(`File changed since it was read: ${target.relativePath}`)
    }
    const originalSnapshot = snapshots.get(target.relativePath) || {
      appliedContent: content,
      content,
      existed,
      uri: target.uri,
    }
    let updated: string
    if (!existed && oldText === '') {
      updated = newText
    } else {
      const firstIndex = content.indexOf(oldText)
      const lastIndex = content.lastIndexOf(oldText)
      if (firstIndex === -1) {
        throw new Error(
          `Text to replace was not found in ${target.relativePath}`,
        )
      }
      if (firstIndex !== lastIndex) {
        throw new Error(
          `Text to replace is not unique in ${target.relativePath}`,
        )
      }
      updated = `${content.slice(0, firstIndex)}${newText}${content.slice(firstIndex + oldText.length)}`
    }
    await writeFile(target.uri, updated)
    snapshots.set(target.relativePath, {
      ...originalSnapshot,
      appliedContent: updated,
    })
    const previousChange = changedFiles.get(target.relativePath)
    const lineChanges = getLineChanges(oldText, newText)
    changedFiles.set(target.relativePath, {
      additions: (previousChange?.additions || 0) + lineChanges.additions,
      deletions: (previousChange?.deletions || 0) + lineChanges.deletions,
      path: target.relativePath,
      status: originalSnapshot.existed ? 'modified' : 'added',
    })
    return `Updated ${target.relativePath} [hash ${hashText(updated)}]`
  }

  return {
    beginTurn() {
      changedFiles = new Map()
      snapshots = new Map()
    },
    async execute(call, signal) {
      try {
        signal?.throwIfAborted()
        if (readToolNames.has(call.name) && !allowRead) {
          throw new Error(
            `Tool ${call.name} is disabled by the file system sandbox`,
          )
        }
        if (writeToolNames.has(call.name) && !allowWrite) {
          throw new Error(
            `Tool ${call.name} is disabled by the file system sandbox`,
          )
        }
        const args = parseArguments(call.arguments)
        if (call.name === 'get_workspace_uri') {
          return success(await getWorkspaceBase(workspaceUriProvider))
        }
        if (call.name === 'search_workspace') {
          if (typeof args.query !== 'string' || !args.query) {
            throw new TypeError('search_workspace requires query')
          }
          return success(
            await searchWorkspace(
              args.query,
              Math.min(100, Math.max(1, args.maxResults ?? 40)),
              signal,
            ),
          )
        }
        if (call.name === 'read_file') {
          if (typeof args.uri !== 'string') {
            throw new TypeError('read_file requires uri')
          }
          return success(
            await readWorkspaceFile(args.uri, args.startLine, args.endLine),
          )
        }
        if (call.name === 'apply_patch') {
          if (
            typeof args.uri !== 'string' ||
            typeof args.oldText !== 'string' ||
            typeof args.newText !== 'string'
          ) {
            throw new TypeError(
              'apply_patch requires uri, oldText, and newText',
            )
          }
          return success(
            await applyPatch(
              args.uri,
              args.oldText,
              args.newText,
              args.expectedHash,
            ),
          )
        }
        if (call.name === 'get_diagnostics') {
          if (!editorContextProvider) {
            return failure(new Error('Diagnostics are unavailable'))
          }
          const context = await editorContextProvider.getContext()
          return success(
            context.diagnostics?.join('\n') || 'No visible diagnostics',
          )
        }
        if (call.name === 'run_command') {
          if (!commandSandbox || typeof args.command !== 'string') {
            return failure(new Error('Sandboxed command execution is disabled'))
          }
          const result = await commandSandbox.execute(args.command, {
            onOutput() {},
            outputLimit: 128_000,
            ...(signal && { signal }),
            timeoutMs: 120_000,
          })
          return result.exitCode === 0
            ? success(result.output.slice(0, 128_000))
            : failure(
                new Error(
                  `Command exited with code ${result.exitCode}\n${result.output.slice(0, 128_000)}`,
                ),
              )
        }
        return failure(new Error(`Unknown tool: ${call.name}`))
      } catch (error) {
        return failure(error)
      }
    },
    getChangedFiles() {
      return [...changedFiles.values()]
    },
    getDefinitions() {
      return availableDefinitions
    },
    async getWorkspaceContext() {
      try {
        const workspace = await getWorkspaceBase(workspaceUriProvider)
        const agentsUri = toWorkspaceUri(workspace, 'AGENTS.md')
        const editorContext = editorContextProvider
          ? await editorContextProvider.getContext()
          : undefined
        const contextParts = [workspaceContextLabel]
        if (fileSystemAccess) {
          contextParts.push(
            allowWrite
              ? 'File system sandbox: read and write access is limited to .'
              : 'File system sandbox: read-only access is limited to .',
          )
        }
        if (editorContext?.activeFile) {
          contextParts.push(`Active file: ${editorContext.activeFile}`)
        }
        if (editorContext?.selection) {
          contextParts.push(
            `Selection:\n${editorContext.selection.slice(0, 8000)}`,
          )
        }
        if (editorContext?.diagnostics?.length) {
          contextParts.push(
            `Visible diagnostics:\n${editorContext.diagnostics.slice(0, 50).join('\n')}`,
          )
        }
        if (await exists(agentsUri)) {
          const contents = await readFile(agentsUri)
          const instructions = contents.slice(0, 16_000)
          contextParts.push(
            `Repository instructions from AGENTS.md:\n${instructions}`,
          )
        }
        return contextParts.join('\n\n')
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
    async revert() {
      if (!allowWrite) {
        throw new Error('File writes are disabled by the file system sandbox')
      }
      const reverted: ChatChangedFile[] = []
      for (const [path, snapshot] of snapshots) {
        const currentlyExists = await exists(snapshot.uri)
        const currentContent = currentlyExists
          ? await readFile(snapshot.uri)
          : ''
        if (currentContent !== snapshot.appliedContent) {
          throw new Error(
            `Cannot revert ${path} because it changed after the agent edit`,
          )
        }
        if (snapshot.existed) {
          await writeFile(snapshot.uri, snapshot.content)
        } else if (await exists(snapshot.uri)) {
          await remove(snapshot.uri)
        }
        reverted.push({ additions: 0, deletions: 0, path, status: 'modified' })
      }
      changedFiles = new Map()
      snapshots = new Map()
      return reverted
    },
    ...(commandSandbox && {
      async verifyChanges(signal?: AbortSignal) {
        const workspace = await getWorkspaceBase(workspaceUriProvider)
        const packageUri = toWorkspaceUri(workspace, 'package.json')
        if (!(await exists(packageUri)) || changedFiles.size === 0) {
          return { checksPassed: 0, failed: false, output: '' }
        }
        const packageJson = JSON.parse(await readFile(packageUri)) as {
          readonly scripts?: Readonly<Record<string, string>>
        }
        const scripts = packageJson.scripts || {}
        const checks = ['type-check', 'test', 'lint']
          .filter((name) => typeof scripts[name] === 'string')
          .slice(0, 2)
        let checksPassed = 0
        const outputs: string[] = []
        for (const check of checks) {
          signal?.throwIfAborted()
          const result = await commandSandbox.execute(`npm run ${check}`, {
            onOutput() {},
            outputLimit: 128_000,
            ...(signal && { signal }),
            timeoutMs: 120_000,
          })
          outputs.push(`$ npm run ${check}\n${result.output.slice(0, 128_000)}`)
          if (result.exitCode !== 0) {
            return {
              checksPassed,
              failed: true,
              output: outputs.join('\n\n'),
            }
          }
          checksPassed++
        }
        return {
          checksPassed,
          failed: false,
          output: outputs.join('\n\n'),
        }
      },
    }),
  }
}
