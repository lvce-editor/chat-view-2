import type { TrelloCard } from '../TrelloTypes/TrelloTypes.ts'
import {
  getAttachmentImageUrl,
  isImageAttachment,
} from './AttachmentHelpers.ts'

const getCardAttachmentImageUrl = (card: Readonly<TrelloCard>): string => {
  const attachment = card.attachments?.find(isImageAttachment)
  if (!attachment) {
    return ''
  }
  return getAttachmentImageUrl(attachment)
}

export const getCardCoverImageUrl = (card: Readonly<TrelloCard>): string => {
  const { cover } = card
  if (!cover) {
    return getCardAttachmentImageUrl(card)
  }
  const scaledUrl = cover.scaled?.at(-1)?.url
  if (scaledUrl) {
    return scaledUrl
  }
  if (cover.url) {
    return cover.url
  }
  return cover.sharedSourceUrl || getCardAttachmentImageUrl(card)
}
