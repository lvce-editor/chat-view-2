import { expect, test } from '@jest/globals'
import { normalizeSearchResponse } from '../src/parts/TrelloClient/NormalizeSearchResponse.ts'

test('normalizeSearchResponse adds result types and preserves card-first order', () => {
  expect(
    normalizeSearchResponse({
      boards: [{ id: 'board-1', name: 'Roadmap' }],
      cards: [{ id: 'card-1', idBoard: 'board-1', name: 'Ship search' }],
    }),
  ).toEqual([
    {
      id: 'card-1',
      idBoard: 'board-1',
      name: 'Ship search',
      type: 'card',
    },
    {
      id: 'board-1',
      name: 'Roadmap',
      type: 'board',
    },
  ])
})

test('normalizeSearchResponse handles missing result arrays', () => {
  expect(normalizeSearchResponse({})).toEqual([])
})
