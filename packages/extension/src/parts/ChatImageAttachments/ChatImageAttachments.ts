import type { ChatImageAttachment } from '../ChatApi/ChatApi.ts'

export interface ImageFile {
  readonly arrayBuffer: () => Promise<ArrayBuffer>
  readonly name: string
  readonly type: string
}

export const isImageFile = (file: ImageFile): boolean =>
  file.type.startsWith('image/')

export const loadImageAttachment = async (
  file: ImageFile,
): Promise<ChatImageAttachment> => {
  if (!isImageFile(file)) {
    throw new TypeError('Only image files can be attached to Chat 2')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const chunks: string[] = []
  for (let index = 0; index < bytes.length; index += 0x80_00) {
    chunks.push(String.fromCodePoint(...bytes.subarray(index, index + 0x80_00)))
  }
  const binary = chunks.join('')
  return {
    dataUrl: `data:${file.type};base64,${btoa(binary)}`,
    mimeType: file.type,
    name: file.name,
  }
}
