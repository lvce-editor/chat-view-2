/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import type {
  AgentToolCall,
  AgentToolDefinition,
} from '../AgentToolHost/AgentToolHost.ts'
import type { ChatModel } from '../ChatApi/ChatApi.ts'

export interface AgentInputMessage {
  readonly content: string
  readonly role: 'user'
}

export interface AgentToolOutput {
  readonly callId: string
  readonly output: string
  readonly type: 'function-call-output'
}

export type AgentInput = AgentInputMessage | AgentToolOutput

export interface AgentStepOptions {
  readonly input: readonly AgentInput[]
  readonly modelId: string
  readonly onTextDelta: (delta: string) => void | Promise<void>
  readonly previousResponseId?: string
  readonly signal?: AbortSignal
  readonly tools: readonly AgentToolDefinition[]
}

export interface AgentStepResult {
  readonly responseId: string
  readonly text: string
  readonly toolCalls: readonly AgentToolCall[]
}

export interface AgentBackend {
  readonly listModels: () => Promise<readonly ChatModel[]>
  readonly runStep: (options: AgentStepOptions) => Promise<AgentStepResult>
}
