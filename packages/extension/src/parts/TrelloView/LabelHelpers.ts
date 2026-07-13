import type { TrelloLabel } from '../TrelloTypes/TrelloTypes.ts'

export const getLabelText = (label: Readonly<TrelloLabel>): string => {
  return label.name?.trim() || label.color?.trim() || 'Label'
}

const knownLabelColors = new Set([
  'black',
  'black_dark',
  'black_light',
  'blue',
  'blue_dark',
  'blue_light',
  'green',
  'green_dark',
  'green_light',
  'lime',
  'lime_dark',
  'lime_light',
  'orange',
  'orange_dark',
  'orange_light',
  'pink',
  'pink_dark',
  'pink_light',
  'purple',
  'purple_dark',
  'purple_light',
  'red',
  'red_dark',
  'red_light',
  'sky',
  'sky_dark',
  'sky_light',
  'yellow',
  'yellow_dark',
  'yellow_light',
])

const toLabelColorClassSuffix = (color: string): string => {
  return color
    .split('_')
    .map((part) => {
      return `${part[0].toUpperCase()}${part.slice(1)}`
    })
    .join('')
}

export const getLabelColorClassName = (color: string | undefined): string => {
  if (!color || !knownLabelColors.has(color)) {
    return 'TrelloCardLabelColorNeutral'
  }
  return `TrelloCardLabelColor${toLabelColorClassSuffix(color)}`
}
