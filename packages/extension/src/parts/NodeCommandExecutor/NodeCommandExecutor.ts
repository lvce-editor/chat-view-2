import type { spawn as spawnProcess } from 'node:child_process'
import type { fileURLToPath as fileUrlToPath } from 'node:url'
import { getWorkspaceFolder } from '@lvce-editor/api'
import type {
  AgentCommandExecutor,
  AgentCommandOptions,
  AgentCommandResult,
} from '../AgentToolHost/AgentToolHost.ts'

// cspell:ignore taskkill

export interface NodeCommandExecutorOptions {
  readonly getWorkspaceFolder?: () => Promise<string>
  readonly runtime?: unknown
}

interface NodeRuntime {
  readonly getBuiltinModule?: (id: string) => unknown
  readonly kill?: (pid: number) => boolean
  readonly platform?: string
  readonly versions?: {
    readonly node?: string
  }
}

const getRuntime = (): unknown => {
  return typeof process === 'undefined' ? undefined : process
}

const uriSchemePattern = /^[a-z][a-z\d+.-]*:\/\//i

export const isNodeRuntime = (runtime: unknown): runtime is NodeRuntime => {
  if (!runtime || typeof runtime !== 'object') {
    return false
  }
  const { versions } = runtime as NodeRuntime
  return typeof versions?.node === 'string' && versions.node.length > 0
}

const hasUriScheme = (value: string): boolean => {
  return uriSchemePattern.test(value)
}

const getWorkspacePath = async (
  getWorkspace: () => Promise<string>,
  getBuiltinModule: (id: string) => unknown,
): Promise<string> => {
  const workspace = await getWorkspace()
  if (!workspace) {
    throw new Error('Open a workspace before running a Bash command')
  }
  if (workspace.startsWith('file://')) {
    const { fileURLToPath } = getBuiltinModule('node:url') as {
      readonly fileURLToPath: typeof fileUrlToPath
    }
    return fileURLToPath(workspace)
  }
  if (hasUriScheme(workspace)) {
    throw new Error('Bash commands require a local file workspace')
  }
  return workspace
}

export const createNodeCommandExecutor = ({
  getWorkspaceFolder: getWorkspace = getWorkspaceFolder,
  runtime = getRuntime(),
}: NodeCommandExecutorOptions = {}): AgentCommandExecutor | undefined => {
  if (!isNodeRuntime(runtime)) {
    return undefined
  }
  const { getBuiltinModule } = runtime
  if (typeof getBuiltinModule !== 'function') {
    return undefined
  }

  return {
    async execute(
      command: string,
      // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
      options: Readonly<AgentCommandOptions>,
    ): Promise<AgentCommandResult> {
      options.signal?.throwIfAborted()
      const { spawn } = getBuiltinModule('node:child_process') as {
        readonly spawn: typeof spawnProcess
      }
      const cwd = await getWorkspacePath(getWorkspace, getBuiltinModule)
      options.signal?.throwIfAborted()

      const child = spawn('bash', ['-c', command], {
        cwd,
        detached: runtime.platform !== 'win32',
        stdio: 'pipe',
      })
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')

      return await new Promise((resolve) => {
        let output = ''
        let stopReason: 'aborted' | 'timeout' | undefined
        let settled = false

        const appendOutput = (chunk: string): void => {
          const available = Math.max(0, options.outputLimit - output.length)
          if (available === 0) {
            return
          }
          const next = chunk.slice(0, available)
          output += next
          options.onOutput(next)
        }

        const cleanup = (): void => {
          clearTimeout(timeout)
          options.signal?.removeEventListener('abort', handleAbort)
          child.stdout.off('data', handleOutput)
          child.stderr.off('data', handleOutput)
          child.off('close', handleClose)
          child.off('error', handleError)
        }

        const finish = (exitCode: number): void => {
          if (settled) {
            return
          }
          settled = true
          cleanup()
          resolve({ exitCode, output })
        }

        const handleOutput = (chunk: string): void => {
          appendOutput(chunk)
        }

        const killChild = (): void => {
          if (runtime.platform === 'win32' && child.pid) {
            const killer = spawn(
              'taskkill',
              ['/pid', String(child.pid), '/T', '/F'],
              { stdio: 'ignore' },
            )
            killer.once('error', child.kill.bind(child))
            return
          }
          if (child.pid && typeof runtime.kill === 'function') {
            try {
              runtime.kill(-child.pid)
              return
            } catch {
              child.kill()
              return
            }
          }
          child.kill()
        }

        const stop = (reason: 'aborted' | 'timeout'): void => {
          if (stopReason) {
            return
          }
          stopReason = reason
          killChild()
        }

        const handleAbort = (): void => {
          stop('aborted')
        }

        const handleClose = (exitCode: number | null): void => {
          if (stopReason === 'timeout') {
            appendOutput(`\nCommand timed out after ${options.timeoutMs}ms`)
            finish(124)
            return
          }
          if (stopReason === 'aborted') {
            appendOutput('\nCommand was aborted')
            finish(130)
            return
          }
          finish(exitCode ?? 1)
        }

        const handleError = (error: Error): void => {
          appendOutput(`Failed to start Bash: ${error.message}`)
          finish(1)
        }

        const timeout = setTimeout(() => {
          stop('timeout')
        }, options.timeoutMs)

        child.stdout.on('data', handleOutput)
        child.stderr.on('data', handleOutput)
        child.once('close', handleClose)
        child.once('error', handleError)
        options.signal?.addEventListener('abort', handleAbort, { once: true })
        if (options.signal?.aborted) {
          handleAbort()
        }
      })
    },
  }
}
