// Normalize timing fields only for results of known Node test commands. File
// contents, exit codes, test names, counts, and failures remain part of the key.
const nodeTestCommand = /^(?:npm (?:run )?test|node --test)(?:\s|$)/u
const tapDuration = /\bduration_ms(?::\s*|\s+)[\d.]+/gu
const testDuration = /\([\d.]+(?:ms|s)\)(?=\r?$)/gmu
const npmNodeTestBanner =
  /^\r?\n> [@\w./-]+@[\w.+-]+ test\r?\n> node --test\r?\n\r?\n/u

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
        typeof value.output !== 'string' ||
        !nodeTestCommand.test(getCommand(value.call_id) || '')
      ) {
        return item
      }
      return {
        ...value,
        output: value.output
          .replace(npmNodeTestBanner, '')
          .replaceAll(tapDuration, 'duration_ms: <time>')
          .replaceAll(testDuration, '(<time>)'),
      }
    }),
  }
}
