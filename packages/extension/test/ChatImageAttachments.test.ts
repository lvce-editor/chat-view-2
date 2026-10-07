import { expect, test } from '@jest/globals'
import { loadImageAttachment } from '../src/parts/ChatImageAttachments/ChatImageAttachments.ts'

test('encodes image bytes as a MIME-aware data URL', async () => {
  const file = {
    arrayBuffer: async (): Promise<ArrayBuffer> =>
      new TextEncoder().encode('hello').buffer,
    name: 'hello.png',
    type: 'image/png',
  }

  await expect(loadImageAttachment(file)).resolves.toEqual({
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    mimeType: 'image/png',
    name: 'hello.png',
  })
})

test('rejects non-image files', async () => {
  await expect(
    loadImageAttachment({
      arrayBuffer: async () => new ArrayBuffer(0),
      name: 'notes.txt',
      type: 'text/plain',
    }),
  ).rejects.toThrow('Only image files can be attached to Chat 2')
})
