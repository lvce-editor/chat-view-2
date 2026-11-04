// Normalize timing fields only for results of known Node test commands. File
// contents, exit codes, test names, counts, and failures remain part of the key.
const nodeTestCommand = /^(?:npm (?:run )?test|node --test)(?:\s|$)/u
const workspaceCommandPrefix = /^cd (["']?)\/recorded-workspace\1\s*&&\s*/u
const npmTestArguments = /^npm (?:run )?test(?: -- (.*))?$/u
const tapDuration = /\bduration_ms(?::\s*|\s+)[\d.]+/gu
const testDuration = /\([\d.]+(?:ms|s)\)(?=\r?$)/gmu
const npmNodeTestBanner =
  /^(Command exited with code \d+\r?\n)?\r?\n> [@\w./-]+@[\w.+-]+ test\r?\n> ([^\r\n]+)\r?\n\r?\n/u

const normalizeOutput = (output: string, command: string): string => {
  const args = npmTestArguments.exec(command)
  const banner = npmNodeTestBanner.exec(output)
  const script = args && (args[1] ? `node --test ${args[1]}` : 'node --test')
  const withoutBanner =
    banner && banner[2] === script
      ? `${banner[1] || ''}${output.slice(banner[0].length)}`
      : output
  return withoutBanner
    .replaceAll(tapDuration, 'duration_ms: <time>')
    .replaceAll(testDuration, '(<time>)')
}

export const normalizeCommandOutput = (
  body: Readonly<Record<string, unknown>>,
  getCommand: (callId: string) => string | undefined,
): Readonly<Record<string, unknown>> => {
  if (!Array.isArray(body.input)) {
    return body
  }
  return {
    ...body,
    input: body.input.map((item: unknown): unknown => {
      if (!item || typeof item !== 'object') {
        return item
      }
      const value = item as Readonly<Record<string, unknown>>
      if (
        value.type !== 'function_call_output' ||
        typeof value.call_id !== 'string' ||
        typeof value.output !== 'string'
      ) {
        return item
      }
      const command = (getCommand(value.call_id) || '').replace(
        workspaceCommandPrefix,
        '',
      )
      if (!nodeTestCommand.test(command)) return item
      return {
        ...value,
        output: normalizeOutput(value.output, command),
      }
    }),
  }
}
