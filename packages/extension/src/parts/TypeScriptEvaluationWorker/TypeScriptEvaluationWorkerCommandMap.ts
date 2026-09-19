/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import * as Babel from '@babel/standalone'
import type {
  TypeScriptExecutionFailure,
  TypeScriptExecutionResult,
  TypeScriptExecutionSuccess,
} from './TypeScriptEvaluationWorker.ts'

interface MockFileSystem {
  readonly readFile: (uri: string) => Promise<string>
  readonly writeFile: (uri: string, content: string) => Promise<void>
}

interface MockWorkspace {
  readonly uri: string
}

interface ModuleExports {
  main?: unknown
}

const files = new Map<string, string>()

const FileSystem: MockFileSystem = {
  async readFile(uri) {
    return files.get(uri) || ''
  },
  async writeFile(uri, content) {
    files.set(uri, content)
  },
}

const Workspace: MockWorkspace = {
  uri: 'file:///workspace/',
}

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

const failure = (error: unknown): TypeScriptExecutionFailure => ({
  error: getErrorMessage(error),
  success: false,
})

const serializeResult = (value: unknown): string => {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch (error) {
    throw new TypeError(
      `main returned a value that cannot be serialized as JSON: ${getErrorMessage(error)}`,
    )
  }
  if (typeof serialized !== 'string') {
    throw new TypeError(
      'main returned a value that cannot be serialized as JSON',
    )
  }
  return serialized
}

const evaluate = async (code: string): Promise<string> => {
  if (!code.trim()) {
    throw new TypeError('TypeScript code must not be empty')
  }
  const transformed = Babel.transform(code, {
    filename: 'chat2-tool.ts',
    plugins: ['transform-modules-commonjs'],
    presets: ['typescript'],
    sourceType: 'module',
  }).code
  if (!transformed) {
    throw new Error('Babel produced no executable code')
  }
  const module: { exports: ModuleExports } = { exports: {} }
  // The worker is explicitly configured with unsafe-eval because this tool evaluates user-provided code.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, sonarjs/code-eval
  const execute = new Function(
    'exports',
    'module',
    'FileSystem',
    'Workspace',
    transformed,
  ) as (
    exports: ModuleExports,
    module: { exports: ModuleExports },
    FileSystem: MockFileSystem,
    Workspace: MockWorkspace,
  ) => void
  execute(module.exports, module, FileSystem, Workspace)
  if (typeof module.exports.main !== 'function') {
    throw new TypeError('TypeScript code must export a function named main')
  }
  const result = await (
    module.exports.main as (context: {
      readonly FileSystem: MockFileSystem
      readonly Workspace: MockWorkspace
    }) => unknown
  )({ FileSystem, Workspace })
  return serializeResult(result)
}

export const executeTypeScript = async (
  code: string,
): Promise<TypeScriptExecutionResult> => {
  try {
    const result: TypeScriptExecutionSuccess = {
      result: await evaluate(code),
      success: true,
    }
    return result
  } catch (error) {
    return failure(error)
  }
}

export const commandMap = {
  'TypeScriptEvaluation.execute': executeTypeScript,
}
