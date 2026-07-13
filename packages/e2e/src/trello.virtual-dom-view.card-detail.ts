// @ts-nocheck
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types */
import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'trello.virtual-dom-view.card-detail'
export const skip = true

const createList = (id, name, cards) => {
  return {
    cards,
    id,
    name,
  }
}

const createBoardDetail = (board, lists) => {
  return {
    board,
    lists,
  }
}

const useMockDataAndShowTrello = async (Command, mockData) => {
  await Command.executeExtensionCommand('trello.test.useMockData', mockData)
  await Command.executeExtensionCommand('trello.show')
}

const connectWithCredentials = async ({ expect, Locator }) => {
  const apiKey = Locator('input[name="apiKey"]')
  const token = Locator('input[name="token"]')
  await expect(apiKey).toBeVisible()
  await expect(token).toBeVisible()
  await apiKey.type('abcdefghijklmnopqrstuvwxyz123456')
  await token.type(
    'abcdefghijklmnopqrstuvwxyz123456abcdefghijklmnopqrstuvwxyz123456',
  )
  const connect = Locator('button[name="connect"]')
  await expect(connect).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await connect.click()
}

const openBoard = async (Locator, expect, boardId = 'board-1') => {
  const board = Locator(`button[name="board:${boardId}"]`)
  await expect(board).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await board.click()
}

const openCard = async (Locator, expect) => {
  const commentCount = Locator('text=1 comment')
  await expect(commentCount).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await commentCount.click({ force: true })
}

export const test: Test = async ({ Command, expect, Locator }) => {
  const board = {
    id: 'board-1',
    name: 'Roadmap',
  }
  const card = {
    badges: {
      comments: 1,
    },
    id: 'card-1',
    name: 'Card 1',
  }
  await useMockDataAndShowTrello(Command, {
    boardDetails: {
      'board-1': createBoardDetail(board, [
        createList('list-1', 'Todo', [card]),
      ]),
    },
    boards: [board],
    cardDetails: {
      'card-1': {
        attachments: [
          {
            id: 'attachment-1',
            mimeType: 'image/png',
            name: 'Screenshot',
            url: 'https://example.com/screenshot.png',
          },
        ],
        card: {
          desc: 'Detailed card description',
          id: 'card-1',
          name: 'Card 1',
        },
        comments: [
          {
            data: {
              text: 'This should show under the description.',
            },
            id: 'comment-1',
            memberCreator: {
              fullName: 'Test User',
            },
          },
        ],
      },
    },
  })
  await connectWithCredentials({ expect, Locator })
  await openBoard(Locator, expect)
  await openCard(Locator, expect)

  const description = Locator('text=Detailed card description')
  const commentAuthor = Locator('text=Test User')
  const commentText = Locator('text=This should show under the description.')
  const image = Locator('.TrelloCardDetailImage')

  await expect(description).toBeVisible()
  await expect(commentAuthor).toBeVisible()
  await expect(commentText).toBeVisible()
  await expect(image).toBeVisible()
}
