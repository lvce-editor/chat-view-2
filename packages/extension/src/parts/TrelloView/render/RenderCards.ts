import { VirtualDomElements } from '@lvce-editor/virtual-dom-worker'
import type { TrelloCard } from '../../TrelloTypes/TrelloTypes.ts'
import * as Dom from '../../VirtualDom/VirtualDom.ts'
import { getCardCoverImageUrl } from '../CardCoverHelpers.ts'
import { getLabelColorClassName, getLabelText } from '../LabelHelpers.ts'
import { getAssetUrl } from '../state/AssetBaseUrl.ts'

const getCardCommentCount = (card: Readonly<TrelloCard>): number => {
  return card.badges?.comments || 0
}

const getCardCommentLabel = (count: number): string => {
  if (count === 1) {
    return '1 comment'
  }
  return `${count} comments`
}

const renderCardCommentIcon = (baseUrl: string): Dom.TreeNode => {
  return Dom.node(VirtualDomElements.Img, {
    alt: '',
    'aria-hidden': true,
    className: 'TrelloCardCommentIcon',
    src: getAssetUrl(baseUrl, 'comments.svg'),
  })
}

const renderCardCommentCount = (
  baseUrl: string,
  card: Readonly<TrelloCard>,
): readonly Dom.TreeNode[] => {
  const commentCount = getCardCommentCount(card)
  if (commentCount <= 0) {
    return []
  }
  const commentLabel = getCardCommentLabel(commentCount)
  const commentCountNode = Dom.node(
    VirtualDomElements.Span,
    { className: 'TrelloCardCommentCount' },
    [Dom.textNode(String(commentCount))],
  )
  return [
    Dom.node(
      VirtualDomElements.Div,
      {
        'aria-label': commentLabel,
        className: 'TrelloCardMeta',
        title: commentLabel,
      },
      [renderCardCommentIcon(baseUrl), commentCountNode],
    ),
  ]
}

const renderCardLabel = (
  label: NonNullable<TrelloCard['labels']>[number],
): Dom.TreeNode => {
  const labelText = getLabelText(label)
  return Dom.node(VirtualDomElements.Div, {
    'aria-label': labelText,
    className: `TrelloCardLabel TrelloCardPreviewLabel ${getLabelColorClassName(label.color)}`,
    title: labelText,
  })
}

const renderCardLabels = (
  card: Readonly<TrelloCard>,
): readonly Dom.TreeNode[] => {
  if (!card.labels || card.labels.length === 0) {
    return []
  }
  return [
    Dom.div(
      'TrelloCardLabels TrelloCardPreviewLabels',
      card.labels.map(renderCardLabel),
    ),
  ]
}

const renderCard = (
  baseUrl: string,
  coverImageUrls: Readonly<Record<string, string>>,
  card: Readonly<TrelloCard>,
): Dom.TreeNode => {
  const coverSourceUrl = getCardCoverImageUrl(card)
  const coverImageUrl = coverSourceUrl ? coverImageUrls[coverSourceUrl] : ''
  const cardBody = Dom.div('TrelloCardBody', [
    ...renderCardLabels(card),
    Dom.div('TrelloCardTitle', [Dom.textNode(card.name)]),
    ...renderCardCommentCount(baseUrl, card),
  ])
  const children = coverImageUrl
    ? [
        Dom.image('TrelloCardCoverImage', coverImageUrl, `${card.name} cover`),
        cardBody,
      ]
    : [cardBody]
  return Dom.node(
    VirtualDomElements.Button,
    {
      className: coverImageUrl
        ? 'TrelloCard TrelloCardWithCover'
        : 'TrelloCard',
      draggable: true,
      name: `card:${card.id}`,
      onContextMenu: 'handleContextMenu',
      onDragEnd: 'handleDragEnd',
      onDragStart: 'handleDragStart',
    },
    children,
  )
}

export const renderCards = (
  baseUrl: string,
  coverImageUrls: Readonly<Record<string, string>>,
  cards: readonly TrelloCard[],
): readonly Dom.TreeNode[] => {
  if (cards.length === 0) {
    return [Dom.textNode('No cards')]
  }
  return cards.map((card) => renderCard(baseUrl, coverImageUrls, card))
}
