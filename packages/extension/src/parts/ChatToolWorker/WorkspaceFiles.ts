import { executeCommand, readFile, writeFile } from '@lvce-editor/api'

interface EditorDocument {
  readonly id: number
  readonly modified: boolean
  readonly text: string
}

const getOpenDocument = async (
  uri: string,
): Promise<EditorDocument | undefined> => {
  return (await executeCommand('GetActiveEditor.getOpenTextDocument', uri)) as
    | EditorDocument
    | undefined
}

export const readWorkspaceFile = async (uri: string): Promise<string> => {
  const document = await getOpenDocument(uri)
  return document?.modified ? document.text : readFile(uri)
}

export const writeWorkspaceFile = async (
  uri: string,
  content: string,
  expectedContent?: string,
): Promise<void> => {
  const document = await getOpenDocument(uri)
  if (document) {
    const expectedText = (expectedContent ?? document.text).replaceAll(
      '\r\n',
      '\n',
    )
    const applied = await executeCommand(
      'GetActiveEditor.applyOpenTextDocumentEdit',
      uri,
      expectedText,
      content.replaceAll('\r\n', '\n'),
    )
    if (applied) {
      return
    }
  }
  if (
    expectedContent !== undefined &&
    (await readFile(uri)) !== expectedContent
  ) {
    throw new Error(
      `File changed since it was read: ${uri}. Read the file again before editing.`,
    )
  }
  await writeFile(uri, content)
}
