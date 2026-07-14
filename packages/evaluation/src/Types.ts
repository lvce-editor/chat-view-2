export interface EvaluationScenario {
  readonly checks: readonly ScenarioCheck[]
  readonly id: string
  readonly model: string
  readonly prompt: string
  readonly temperature?: number
  readonly timeoutMs: number
}

export type ScenarioCheck =
  | {
      readonly path: string
      readonly type: 'fileExists'
    }
  | {
      readonly path: string
      readonly text: string
      readonly type: 'fileContains'
    }
  | {
      readonly command: string
      readonly type: 'command'
    }

export interface RecordedHttpResponse {
  readonly body: string
  readonly headers: Readonly<Record<string, string>>
  readonly status: number
}

export interface RecordedToolCall {
  readonly arguments: string
  readonly callId: string
  readonly name: string
}

export interface RecordedToolResult {
  readonly callId: string
  readonly output: string
}

export interface EvaluationExchange {
  readonly cacheKey: string
  readonly request: {
    readonly body: unknown
    readonly method: 'POST'
    readonly path: '/v1/responses'
  }
  readonly response: RecordedHttpResponse
  readonly source: 'cache' | 'upstream'
  readonly toolCalls: readonly RecordedToolCall[]
  readonly toolResults: readonly RecordedToolResult[]
}

export interface EvaluationTranscript {
  readonly exchanges: readonly EvaluationExchange[]
  readonly model: string
  readonly scenarioId: string
  readonly schemaVersion: 1
  readonly startedAt: string
  readonly temperature?: number
  readonly updatedAt: string
}
