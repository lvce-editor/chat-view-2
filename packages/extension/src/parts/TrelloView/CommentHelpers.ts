import type { TrelloComment } from '../TrelloTypes/TrelloTypes.ts'

const commentDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
})

const whitespaceRegex = /\s+/
const trelloAvatarHosts = new Set([
  'trello-avatars.s3.amazonaws.com',
  'trello-members.s3.amazonaws.com',
])
const avatarImageExtensionRegex = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i

const getDerivedInitials = (name: string): string => {
  const parts = name
    .trim()
    .split(whitespaceRegex)
    .filter((part) => part.length > 0)
  if (parts.length === 0) {
    return ''
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0]}${parts.at(-1)?.[0]}`.toUpperCase()
}

export const getCommentAuthor = (comment: Readonly<TrelloComment>): string => {
  return (
    comment.memberCreator?.fullName?.trim() ||
    comment.memberCreator?.username?.trim() ||
    'Unknown member'
  )
}

export const getCommentText = (comment: Readonly<TrelloComment>): string => {
  return comment.data.text?.trim() || 'No comment text'
}

export const getCommentInitials = (
  comment: Readonly<TrelloComment>,
): string => {
  const memberName =
    comment.memberCreator?.fullName?.trim() ||
    comment.memberCreator?.username?.trim() ||
    ''
  return (
    comment.memberCreator?.initials?.trim() ||
    getDerivedInitials(memberName) ||
    '?'
  )
}

export const getCommentDateText = (
  comment: Readonly<TrelloComment>,
): string => {
  if (!comment.date) {
    return ''
  }
  const time = Date.parse(comment.date)
  if (Number.isNaN(time)) {
    return ''
  }
  return commentDateFormatter.format(new Date(time))
}

export const getCommentAvatarUrl = (
  comment: Readonly<TrelloComment>,
): string => {
  const avatarUrl = comment.memberCreator?.avatarUrl?.trim() || ''
  if (!avatarUrl) {
    return ''
  }
  let url: URL
  try {
    url = new URL(avatarUrl)
  } catch {
    return avatarUrl
  }
  if (
    !trelloAvatarHosts.has(url.hostname) ||
    avatarImageExtensionRegex.test(url.pathname)
  ) {
    return avatarUrl
  }
  url.pathname = url.pathname.endsWith('/')
    ? `${url.pathname}50.png`
    : `${url.pathname}/50.png`
  return url.href
}
