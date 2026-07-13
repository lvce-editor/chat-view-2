interface DomEventListener {
  readonly name: string | number
  readonly params: readonly string[]
  readonly preventDefault?: boolean
}

export const renderEventListeners = (): readonly DomEventListener[] => {
  return [
    {
      name: 'handleDragStart',
      params: ['handleViewEvent', 'dragstart', 'event.target.name'],
    },
    {
      name: 'handleDragEnd',
      params: ['handleViewEvent', 'dragend', 'event.target.name'],
    },
    {
      name: 'handleDragOver',
      params: ['handleViewEvent', 'dragover', 'event.currentTarget.name'],
      preventDefault: true,
    },
    {
      name: 'handleDragLeave',
      params: ['handleViewEvent', 'dragleave', 'event.currentTarget.name'],
    },
    {
      name: 'handleDrop',
      params: ['handleViewEvent', 'drop', 'event.currentTarget.name'],
      preventDefault: true,
    },
    {
      name: 'handleKeyDown',
      params: ['handleViewEvent', 'keydown', 'event.target.name', 'event.key'],
    },
    {
      name: 'handlePointerDown',
      params: [
        'handleViewEvent',
        'pointerdown',
        'event.target.name',
        'event.clientX',
      ],
    },
    {
      name: 'handleCardLabelPickerPointerDown',
      params: ['handleViewEvent', 'pointerdown', 'event.currentTarget.name'],
      preventDefault: true,
    },
    {
      name: 'handlePointerMove',
      params: [
        'handleViewEvent',
        'pointermove',
        'event.target.name',
        'event.clientX',
      ],
    },
    {
      name: 'handlePointerUp',
      params: ['handleViewEvent', 'pointerup', 'event.target.name'],
    },
  ]
}
