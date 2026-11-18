// cspell:words AQID

import { expect, jest, test } from '@jest/globals'
import { createBoardFavicon } from '../src/parts/BoardView/BoardFavicon.ts'

const decode = (url: string): string => decodeURIComponent(url.split(',', 2)[1])

test('uses Trello columns and the board gradient instead of the application icon', async () => {
  const svg = decode(
    await createBoardFavicon(
      { bottomColor: '#ff58b0', topColor: '#a82be0' },
      new AbortController().signal,
    ),
  )
  expect(svg).toContain('stop-color="#a82be0"')
  expect(svg).toContain('stop-color="#ff58b0"')
  expect(svg).toContain('width="16" height="37"')
  expect(svg).toContain('width="16" height="23"')
})

test('embeds a photo without sending the Trello token to the image host', async () => {
  const request = jest.fn<typeof fetch>().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/png' },
    }),
  )
  const svg = decode(
    await createBoardFavicon(
      { image: 'https://backgrounds.test/photo.png' },
      new AbortController().signal,
      request,
    ),
  )
  expect(svg).toContain('href="data:image/png;base64,AQID"')
  expect(svg).toContain('xMinYMin slice')
  expect(request).toHaveBeenCalledWith(
    'https://backgrounds.test/photo.png',
    expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
  )
  expect(request.mock.calls[0]?.[1]?.headers).toBeUndefined()
})

test.each([
  (): Response =>
    new Response('invalid', { headers: { 'content-type': 'text/html' } }),
  (): Response =>
    new Response(new Uint8Array(1_000_001), {
      headers: { 'content-type': 'image/png' },
    }),
  (): Response => new Response('', { status: 503 }),
])(
  'falls back to board color when the background image cannot be used',
  async (response) => {
    const request = jest.fn<typeof fetch>().mockResolvedValue(response())
    const svg = decode(
      await createBoardFavicon(
        { color: '#22a06b', image: 'https://backgrounds.test/photo.png' },
        new AbortController().signal,
        request,
      ),
    )
    expect(svg).toContain('fill="#22a06b"')
    expect(svg).not.toContain('<image')
  },
)

test('propagates cancellation rather than producing a stale image', async () => {
  const controller = new AbortController()
  const request = jest.fn<typeof fetch>().mockImplementation(async () => {
    controller.abort()
    throw controller.signal.reason
  })
  await expect(
    createBoardFavicon(
      { image: 'https://backgrounds.test/photo.png' },
      controller.signal,
      request,
    ),
  ).rejects.toThrow()
})
