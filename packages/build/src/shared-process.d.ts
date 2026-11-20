declare module '@lvce-editor/shared-process' {
  export const exportStatic: (options: {
    extensionPath: string
    extensionPaths?: string[]
    testPath: string
    root: string
  }) => Promise<{ commitHash: string }>
}
