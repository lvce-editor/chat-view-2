import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  EvaluationExchange,
  EvaluationTranscript,
  RecordedToolCall,
  RecordedToolResult,
} from './Types.ts'

const eventSeparatorRegex = /\r?\n\r?\n/
const lineSeparatorRegex = /\r?\n/

const getDataBlocks = (body: string): readonly string[] => {
  return body
    .split(eventSeparatorRegex)
    .map((block) =>
      block
        .split(lineSeparatorRegex)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n'),
    )
    .filter((data) => data && data !== '[DONE]')
}

export const getToolCalls = (body: string): readonly RecordedToolCall[] => {
  const calls: RecordedToolCall[] = []
  for (const data of getDataBlocks(body)) {
    const event = JSON.parse(data) as {
      readonly item?: Readonly<Record<string, unknown>>
      readonly type?: string
    }
    const { item } = event
    if (
      event.type === 'response.output_item.done' &&
      item?.type === 'function_call' &&
      typeof item.name === 'string'
    ) {
      let callId = `call-${calls.length + 1}`
      if (typeof item.id === 'string') {
        callId = item.id
      }
      if (typeof item.call_id === 'string') {
        callId = item.call_id
      }
      calls.push({
        arguments: typeof item.arguments === 'string' ? item.arguments : '{}',
        callId,
        name: item.name,
      })
    }
  }
  return calls
}

export const getToolResults = (
  requestBody: unknown,
): readonly RecordedToolResult[] => {
  if (!requestBody || typeof requestBody !== 'object') {
    return []
  }
  const { input } = requestBody as Readonly<Record<string, unknown>>
  if (!Array.isArray(input)) {
    return []
  }
  return input.flatMap((item): readonly RecordedToolResult[] => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const value = item as Readonly<Record<string, unknown>>
    if (
      value.type !== 'function_call_output' ||
      typeof value.call_id !== 'string' ||
      typeof value.output !== 'string'
    ) {
      return []
    }
    return [{ callId: value.call_id, output: value.output }]
  })
}

export interface TranscriptWriter {
  readonly append: (exchange: EvaluationExchange) => Promise<void>
}

export const createTranscriptWriter = (
  path: string,
  scenarioId: string,
  model: string,
  temperature: number,
): TranscriptWriter => {
  const startedAt = new Date().toISOString()
  const exchanges: EvaluationExchange[] = []
  return {
    async append(exchange): Promise<void> {
      exchanges.push(exchange)
      const transcript: EvaluationTranscript = {
        exchanges,
        model,
        scenarioId,
        schemaVersion: 1,
        startedAt,
        temperature,
        updatedAt: new Date().toISOString(),
      }
      await mkdir(dirname(path), { recursive: true })
      const temporaryPath = `${path}.${process.pid}.tmp`
      await writeFile(
        temporaryPath,
        `${JSON.stringify(transcript, undefined, 2)}\n`,
      )
      await rm(path, { force: true })
      await rename(temporaryPath, path)
    },
  }
}
