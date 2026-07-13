interface DomEventListener {
  readonly name: string
  readonly params: readonly string[]
  readonly preventDefault?: boolean
}

export const renderEventListeners = (): readonly DomEventListener[] => {
  return [
    {
      name: 'handleKeyDown',
      params: [
        'handleViewEvent',
        'keydown',
        'event.target.name',
        'event.key',
      ],
    },
  ]
}
