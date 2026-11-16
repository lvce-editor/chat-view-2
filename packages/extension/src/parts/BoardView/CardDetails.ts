export interface CardAttachment {
  readonly name: string
  readonly url: string
}

export interface CardActivity {
  readonly author: string
  readonly date: string
  readonly text: string
}

export interface CardDetails {
  readonly activities: readonly CardActivity[]
  readonly attachments: readonly CardAttachment[]
  readonly desc: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeAttachments = (
  values: readonly unknown[],
): readonly CardAttachment[] => {
  const attachments: CardAttachment[] = []
  for (const attachment of values) {
    if (
      !isRecord(attachment) ||
      typeof attachment.name !== 'string' ||
      typeof attachment.url !== 'string'
    )
      continue
    const url = URL.parse(attachment.url)
    if (url?.protocol === 'https:')
      attachments.push({ name: attachment.name, url: url.href })
  }
  return attachments
}

const activityText = (
  type: unknown,
  data: Readonly<Record<string, unknown>>,
): string => {
  const { listAfter, text } = data
  if (type === 'commentCard' && typeof text === 'string') return text
  if (type === 'createCard') return 'Created this card'
  if (
    type === 'updateCard' &&
    isRecord(listAfter) &&
    typeof listAfter.name === 'string'
  )
    return `Moved this card to ${listAfter.name}`
  return ''
}

const normalizeActivities = (
  values: readonly unknown[],
): readonly CardActivity[] => {
  const activities: CardActivity[] = []
  for (const action of values) {
    if (
      !isRecord(action) ||
      !isRecord(action.data) ||
      typeof action.date !== 'string'
    )
      continue
    const { data, date, memberCreator, type } = action
    const member = isRecord(memberCreator) ? memberCreator : undefined
    const author =
      typeof member?.fullName === 'string' ? member.fullName : 'Trello member'
    const text = activityText(type, data)
    if (text) activities.push({ author, date, text })
  }
  return activities
}

export const normalizeDetails = (value: unknown): CardDetails => {
  if (
    !isRecord(value) ||
    typeof value.desc !== 'string' ||
    !Array.isArray(value.attachments) ||
    !Array.isArray(value.actions)
  )
    throw new Error('Invalid card details')
  return {
    activities: normalizeActivities(value.actions),
    attachments: normalizeAttachments(value.attachments),
    desc: value.desc,
  }
}
