import type { RawData } from 'ws'
import { WebSocket } from 'ws'

const trailingSlash = /\/$/u

// ws exposes mutable buffer types; this helper only decodes their contents.
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
export const socketDataToText = (data: Readonly<RawData>): string => {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8')
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8')
  }
  return (data as Buffer).toString('utf8')
}
import type { RecordedHttpResponse } from './Types.ts'

export const recordWebSocketResponse = async (
  baseUrl: string,
  token: string,
  body: Readonly<Record<string, unknown>>,
): Promise<RecordedHttpResponse> => {
  const url = new URL(`${baseUrl.replace(trailingSlash, '')}/responses`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(url, ['lvce.responses.v1', token])
  const frames: string[] = []
  try {
    return await new Promise<RecordedHttpResponse>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(new Error('Recording timed out before response.completed')),
        120_000,
      )
      const fail = (error: Error): void => {
        clearTimeout(timeout)
        reject(error)
      }
      socket.on('error', fail)
      socket.on('close', () =>
        fail(new Error('Backend closed before recording completed')),
      )
      socket.on('open', () => {
        const { stream: _stream, ...request } = body
        socket.send(JSON.stringify({ ...request, type: 'response.create' }))
      })
      // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
      socket.on('message', (data: Readonly<RawData>) => {
        const text = socketDataToText(data)
        try {
          const event = JSON.parse(text) as { readonly type?: string }
          frames.push(`data: ${JSON.stringify(event)}\n\n`)
          if (event.type === 'response.completed') {
            clearTimeout(timeout)
            resolve({
              body: frames.join(''),
              headers: { 'content-type': 'text/event-stream' },
              status: 200,
            })
          } else if (
            event.type === 'error' ||
            event.type === 'response.failed'
          ) {
            fail(new Error(`Backend recording failed: ${text}`))
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  } finally {
    socket.close()
  }
}
