// cspell:ignore prefs

export interface TrelloCredentials {
  readonly apiKey: string
  readonly token: string
}

export interface TrelloOrganization {
  readonly displayName?: string
  readonly id: string
  readonly name: string
}

export interface TrelloBoardBackgroundImage {
  readonly height?: number
  readonly url?: string
  readonly width?: number
}

export interface TrelloBoardPreferences {
  readonly backgroundBottomColor?: string
  readonly backgroundBrightness?: string
  readonly backgroundColor?: string
  readonly backgroundImage?: string | null
  readonly backgroundImageScaled?: readonly TrelloBoardBackgroundImage[]
  readonly backgroundTile?: boolean
  readonly backgroundTopColor?: string
}

export interface TrelloBoard {
  readonly dateLastView?: string
  readonly id: string
  readonly idOrganization?: string
  readonly name: string
  readonly organization?: TrelloOrganization
  readonly prefs?: TrelloBoardPreferences
  readonly url?: string
}

export interface TrelloLabel {
  readonly color?: string
  readonly id: string
  readonly idBoard?: string
  readonly name?: string
}

export interface TrelloCardBadges {
  readonly comments?: number
}

export interface TrelloCardCoverScaled {
  readonly height?: number
  readonly url?: string
  readonly width?: number
}

export interface TrelloCardCover {
  readonly color?: string | null
  readonly scaled?: readonly TrelloCardCoverScaled[]
  readonly sharedSourceUrl?: string | null
  readonly size?: string
  readonly url?: string | null
}

export interface TrelloCard {
  readonly attachments?: readonly TrelloAttachment[]
  readonly badges?: TrelloCardBadges
  readonly cover?: TrelloCardCover | null
  readonly desc?: string
  readonly id: string
  readonly idBoard?: string
  readonly idList?: string
  readonly labels?: readonly TrelloLabel[]
  readonly name: string
  readonly url?: string
}

export interface TrelloAttachmentPreview {
  readonly url?: string
}

export interface TrelloAttachment {
  readonly id: string
  readonly mimeType?: string
  readonly name?: string
  readonly previews?: readonly TrelloAttachmentPreview[]
  readonly url?: string
}

export interface TrelloCommentData {
  readonly text?: string
}

export interface TrelloCommentMember {
  readonly avatarHash?: string
  readonly avatarUrl?: string
  readonly fullName?: string
  readonly id?: string
  readonly initials?: string
  readonly username?: string
}

export interface TrelloComment {
  readonly data: TrelloCommentData
  readonly date?: string
  readonly id: string
  readonly memberCreator?: TrelloCommentMember
}

export interface TrelloCardDetail {
  readonly attachments: readonly TrelloAttachment[]
  readonly card: TrelloCard
  readonly comments: readonly TrelloComment[]
}

export interface TrelloCardUpdate {
  readonly desc: string
  readonly name: string
}

export interface TrelloCardCreate {
  readonly name: string
  readonly pos: 'bottom'
}

export interface TrelloCardMove {
  readonly idList: string
  readonly pos: 'bottom' | 'top'
}

export interface TrelloList {
  readonly cards: readonly TrelloCard[]
  readonly id: string
  readonly name: string
}

export interface TrelloListCreate {
  readonly name: string
  readonly pos: 'bottom'
}

export interface TrelloListUpdate {
  readonly name: string
}

export interface TrelloBoardDetail {
  readonly board: TrelloBoard
  readonly lists: readonly TrelloList[]
}

export interface TrelloBoardSearchResult extends TrelloBoard {
  readonly type: 'board'
}

export interface TrelloCardSearchResult extends TrelloCard {
  readonly type: 'card'
}

export type TrelloSearchResult =
  | TrelloBoardSearchResult
  | TrelloCardSearchResult
