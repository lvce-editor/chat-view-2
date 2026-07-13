// @ts-nocheck
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types */
import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'trello.virtual-dom-view.list-create'
// export const skip = true

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

const openCard = async (Locator, expect, cardId = 'card-1') => {
  const card = Locator(`button[name="card:${cardId}"]`)
  await expect(card).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await card.click()
}

export const test: Test = async ({ Command, expect, Locator }) => {
  // arrange
  const board = {
    id: 'board-1',
    name: 'Roadmap',
  }

  // TODO use createBoard function

  await useMockDataAndShowTrello(Command, {
    boardDetails: {
      'board-1': createBoardDetail(board, []),
    },
    boards: [board],
    cardDetails: {},
  })
  await connectWithCredentials({ expect, Locator })
  await openBoard(Locator, expect)

  // act
  await Command.executeExtensionCommand('trello.addList', {
    name: 'abc',
  })
  await Command.executeExtensionCommand('trello.addList', {
    name: 'def',
  })

  // assert
  // const list = Locator('[name="listTitle:created-list-1"]')
  // await expect(list).toBeVisible()
}
