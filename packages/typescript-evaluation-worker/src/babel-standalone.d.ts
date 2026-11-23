declare module '@babel/standalone' {
  interface TransformOptions {
    readonly filename?: string
    readonly plugins?: readonly string[]
    readonly presets?: readonly string[]
    readonly sourceType?: 'module' | 'script' | 'unambiguous'
  }

  interface TransformResult {
    readonly code?: string
  }

  export const transform: (
    code: string,
    options?: TransformOptions,
  ) => TransformResult
}
