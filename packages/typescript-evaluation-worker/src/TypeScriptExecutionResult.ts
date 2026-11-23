export interface TypeScriptExecutionSuccess {
  readonly result: string
  readonly success: true
}

export interface TypeScriptExecutionFailure {
  readonly error: string
  readonly success: false
}

export type TypeScriptExecutionResult =
  | TypeScriptExecutionFailure
  | TypeScriptExecutionSuccess
