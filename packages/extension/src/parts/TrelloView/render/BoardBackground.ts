// cspell:ignore prefs

import type {
  TrelloBoard,
  TrelloBoardBackgroundImage,
} from '../../TrelloTypes/TrelloTypes.ts'

const hexColorPattern = /^#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?$/i

const escapeCssString = (value: string): string => {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\a ')
    .replaceAll('\r', '\\d ')
    .replaceAll('\f', '\\c ')
}

const getImageSize = (image: Readonly<TrelloBoardBackgroundImage>): number => {
  return (image.width || 0) * (image.height || 0)
}

const getLargestBackgroundImage = (
  images: readonly TrelloBoardBackgroundImage[] | undefined,
): string => {
  if (!images || images.length === 0) {
    return ''
  }
  let largest = images[0]
  for (const image of images) {
    if (getImageSize(image) > getImageSize(largest)) {
      largest = image
    }
  }
  return largest.url || ''
}

const getBackgroundImage = (board: Readonly<TrelloBoard>): string => {
  return (
    getLargestBackgroundImage(board.prefs?.backgroundImageScaled) ||
    board.prefs?.backgroundImage ||
    ''
  )
}

const getBackgroundColor = (board: Readonly<TrelloBoard>): string => {
  const color =
    board.prefs?.backgroundBottomColor ||
    board.prefs?.backgroundTopColor ||
    board.prefs?.backgroundColor ||
    ''
  if (!hexColorPattern.test(color)) {
    return ''
  }
  return color
}

const hasBoardBackground = (board: Readonly<TrelloBoard>): boolean => {
  return Boolean(getBackgroundImage(board) || getBackgroundColor(board))
}

export const getBoardBackgroundClassName = (
  board: Readonly<TrelloBoard>,
  enabled: boolean,
): string => {
  if (!enabled || !hasBoardBackground(board)) {
    return 'TrelloView TrelloBoardDetail'
  }
  return 'TrelloView TrelloBoardDetail TrelloBoardDetailWithBackground'
}

export const getBoardBackgroundStyle = (
  board: Readonly<TrelloBoard>,
  enabled: boolean,
): string | undefined => {
  if (!enabled) {
    return undefined
  }
  const properties: string[] = []
  const image = getBackgroundImage(board)
  const color = getBackgroundColor(board)
  if (image) {
    properties.push(
      `--TrelloBoardBackgroundImage: url("${escapeCssString(image)}")`,
    )
    properties.push(
      `--TrelloBoardBackgroundRepeat: ${
        board.prefs?.backgroundTile ? 'repeat' : 'no-repeat'
      }`,
    )
    properties.push(
      `--TrelloBoardBackgroundSize: ${
        board.prefs?.backgroundTile ? 'auto' : 'cover'
      }`,
    )
  }
  if (color) {
    properties.push(`--TrelloBoardBackgroundColor: ${color}`)
  }
  if (properties.length === 0) {
    return undefined
  }
  return properties.join('; ')
}
