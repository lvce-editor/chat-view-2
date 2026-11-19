/* eslint-disable unicorn/max-nested-calls */

import {
  mergeClassNames,
  VirtualDomElements,
} from '@lvce-editor/virtual-dom-worker'
import type { CardDetails } from './CardDetails.ts'
import type {
  BoardError,
  TrelloBoard,
  TrelloBoardSummary,
  TrelloCard,
  TrelloSearchResult,
} from './Trello.ts'
import * as Dom from '../VirtualDom/VirtualDom.ts'
import { renderDescriptionMarkdown } from './DescriptionMarkdown.ts'

const primaryButtonClass = mergeClassNames('BoardButton', 'BoardPrimaryButton')
const cardButtonClass = mergeClassNames('BoardCard', 'BoardCardButton')
const descriptionInputClass = mergeClassNames(
  'BoardInput',
  'BoardDescriptionInput',
)
const searchInputClass = mergeClassNames('BoardInput', 'BoardSearchInput')

export interface CardDraft {
  readonly error?: string | undefined
  readonly listId: string
  readonly saving: boolean
  readonly title: string
}

export interface BoardState {
  readonly accountConnected?: boolean
  readonly authorizationUrl?: string | undefined
  readonly authorizing?: boolean
  readonly board: TrelloBoard | undefined
  readonly boardId: string
  readonly boards: readonly TrelloBoardSummary[]
  readonly cardDraft?: CardDraft | undefined
  readonly connectedIds: readonly string[]
  readonly details?: CardDetails | undefined
  readonly detailsError?: string | undefined
  readonly detailsLoading?: boolean
  readonly draggedCardId?: string | undefined
  readonly dropTargetId?: string | undefined
  readonly editDesc?: string
  readonly editDescription?: boolean
  readonly editError?: string | undefined
  readonly editingCard?: TrelloCard | undefined
  readonly editName?: string
  readonly error: BoardError | undefined
  readonly loading: boolean
  readonly optionsOpen?: boolean
  readonly providerSelected: boolean
  readonly savingCard?: boolean
  readonly searchError?: BoardError | undefined
  readonly searchLoading?: boolean
  readonly searchQuery?: string
  readonly searchResults?: readonly TrelloSearchResult[]
}

const input = (
  name: string,
  label: string,
  value?: string,
  disabled = false,
): Dom.Node =>
  Dom.node(VirtualDomElements.Label, { className: 'BoardField' }, [
    Dom.textNode(label),
    Dom.node(VirtualDomElements.Input, {
      ariaLabel: label,
      autoComplete: 'off',
      className: 'BoardInput',
      ...(disabled && { disabled: true }),
      inputType: 'text',
      name,
      ...(name === 'board-card-title' && { onBlur: 'handleBlur' }),
      onInput: 'handleInput',
      spellcheck: false,
      ...(value !== undefined && { value }),
    }),
  ])

const renderComposer = (
  state: BoardState,
  listId: string,
  listName: string,
): Dom.Node => {
  const { cardDraft: draft, loading } = state
  if (draft?.listId !== listId)
    return Dom.button(
      `board-add:${listId}`,
      'Add a card',
      'BoardButton BoardAddCard',
      {
        ariaLabel: `Add a card to ${listName}`,
        disabled: Boolean(draft?.saving) || loading,
      },
    )
  return Dom.form('board-create-card', 'BoardCardComposer', [
    input('board-card-title', 'Card title', draft.title, draft.saving),
    ...(draft.error
      ? [
          Dom.node(
            VirtualDomElements.Div,
            { className: 'BoardCardError', role: 'alert' },
            [Dom.textNode(draft.error)],
          ),
        ]
      : []),
    Dom.div('BoardCardActions', [
      Dom.node(
        VirtualDomElements.Button,
        {
          buttonType: 'submit',
          className: primaryButtonClass,
          disabled:
            draft.saving ||
            !draft.title.trim() ||
            draft.title.trim().length > 16_384,
        },
        [Dom.textNode(draft.saving ? 'Adding…' : 'Add card')],
      ),
      Dom.button('board-cancel-card', 'Cancel', 'BoardButton', {
        disabled: draft.saving,
      }),
    ]),
  ])
}

const renderBoardTile = (
  board: TrelloBoardSummary,
  loading: boolean,
  ariaLabel = `Open ${board.name}`,
): Dom.Node =>
  Dom.node(
    VirtualDomElements.Button,
    {
      ariaLabel,
      buttonType: 'button',
      className: 'BoardTile',
      disabled: loading,
      name: `board-select:${board.id}`,
      onClick: 'handleClick',
    },
    [
      Dom.node(
        VirtualDomElements.Span,
        {
          className: 'BoardTileBackground',
          style: [
            board.backgroundColor &&
              `background-color:${board.backgroundColor}`,
            board.backgroundGradient &&
              `background-image:${board.backgroundGradient}`,
            board.backgroundColor &&
              !board.backgroundGradient &&
              'background-image:none',
          ]
            .filter(Boolean)
            .join(';'),
        },
        board.backgroundImage
          ? [
              Dom.node(VirtualDomElements.Img, {
                alt: '',
                className: 'BoardTileImage',
                loading: 'lazy',
                src: board.backgroundImage,
              }),
            ]
          : [],
      ),
      Dom.node(VirtualDomElements.Span, { className: 'BoardTileName' }, [
        Dom.textNode(board.name),
      ]),
    ],
  )

const renderBoardTiles = (state: BoardState): Dom.Node => {
  const { boards, loading, searchQuery = '' } = state
  const query = searchQuery.trim().toLocaleLowerCase()
  const matchingBoards = query
    ? boards.filter((board) => board.name.toLocaleLowerCase().includes(query))
    : boards
  return Dom.div(
    'BoardTileGrid',
    matchingBoards.map((board) => renderBoardTile(board, loading)),
  )
}

const renderBoardSearch = (state: BoardState): Dom.Node => {
  const {
    boards,
    searchError,
    searchLoading,
    searchQuery = '',
    searchResults = [],
  } = state
  const query = searchQuery.trim().toLocaleLowerCase()
  const matchingBoards = boards.some((board) =>
    board.name.toLocaleLowerCase().includes(query),
  )
  const showEmpty = searchResults.length === 0 && !searchLoading && !searchError
  const emptyContent = matchingBoards
    ? [renderBoardTiles(state)]
    : [Dom.div('BoardSearchEmpty', [Dom.textNode('No boards or cards found')])]
  const renderSearchResult = (result: TrelloSearchResult): Dom.Node => {
    const boardName =
      result.boardName ||
      boards.find((board) => board.id === result.boardId)?.name
    const name = boardName
      ? `Card · ${result.name} — ${boardName}`
      : `Card · ${result.name}`
    return Dom.button(
      result.kind === 'board'
        ? `board-select:${result.id}`
        : `board-search-card:${result.id}`,
      result.kind === 'board' ? `Board · ${result.name}` : name,
      'BoardSearchResult',
    )
  }
  return Dom.div('BoardSearch', [
    Dom.node(VirtualDomElements.Input, {
      ariaLabel: 'Search boards',
      autoComplete: 'off',
      className: searchInputClass,
      inputType: 'search',
      name: 'board-search',
      onBlur: 'handleBlur',
      onInput: 'handleInput',
      placeholder: 'Search boards and cards',
      spellcheck: false,
      value: searchQuery,
    }),
    ...(query
      ? [
          Dom.div('BoardSearchResults', [
            ...(searchLoading
              ? [
                  Dom.div('BoardSearchStatus', [
                    Dom.textNode('Searching Trello…'),
                  ]),
                ]
              : []),
            ...(searchError
              ? [
                  Dom.div('BoardSearchError', [
                    Dom.textNode(searchError.message),
                  ]),
                ]
              : []),
            ...searchResults.map(renderSearchResult),
            ...(showEmpty ? emptyContent : []),
          ]),
        ]
      : []),
  ])
}

const connectionHelp = (state: BoardState): string => {
  const { boards, error, loading } = state
  if (loading) return 'Loading your Trello boards…'
  if (boards.length === 0 && !error)
    return 'No open boards found. Create a board in Trello, then refresh this list.'
  return 'Trello is connected. Choose a board to open it.'
}

const renderConnection = (state: BoardState): readonly Dom.Node[] => {
  const {
    accountConnected,
    authorizationUrl,
    authorizing,
    loading,
    searchQuery,
  } = state
  return accountConnected
    ? [
        Dom.div('BoardCredentialsHelp', [Dom.textNode(connectionHelp(state))]),
        renderBoardSearch(state),
        ...(searchQuery ? [] : [renderBoardTiles(state)]),
        Dom.button('board-check-account', 'Refresh boards', 'BoardButton', {
          disabled: loading,
        }),
        Dom.button(
          'board-disconnect-account',
          'Disconnect Trello',
          'BoardButton',
          { disabled: loading },
        ),
      ]
    : [
        Dom.div('BoardCredentialsHelp', [
          Dom.textNode(
            authorizing
              ? 'Allow access in Trello. This view will update when you finish.'
              : 'Sign in to LVCE, then authorize Trello to read your boards and add cards.',
          ),
        ]),
        Dom.div('BoardAuthorizationActions', [
          ...(authorizationUrl
            ? [
                Dom.link(
                  authorizationUrl,
                  'Continue to Trello',
                  primaryButtonClass,
                ),
              ]
            : [
                Dom.button(
                  'board-authorize',
                  authorizing ? 'Preparing connection…' : 'Authorize Trello',
                  primaryButtonClass,
                  { disabled: loading || Boolean(authorizing) },
                ),
              ]),
          ...(authorizing
            ? [
                Dom.button(
                  'board-cancel-authorization',
                  'Stop waiting',
                  'BoardButton',
                ),
              ]
            : []),
        ]),
      ]
}
const renderSetup = (state: BoardState): Dom.Node => {
  const { boards, connectedIds, loading, providerSelected, searchQuery } = state
  const showProviderGrid = !providerSelected
  const rememberedIds = connectedIds.filter((id) =>
    boards.every((board) => board.id !== id),
  )
  return Dom.div('BoardSetup', [
    Dom.heading(2, 'BoardSetupTitle', 'Connect a board'),
    ...(showProviderGrid
      ? [
          Dom.div('BoardProviderGrid', [
            Dom.button(
              'board-provider:trello',
              'Connect Trello',
              'BoardProviderCard',
              { ariaLabel: 'Connect Trello' },
            ),
          ]),
        ]
      : [
          Dom.div('BoardProviderSetup', [
            Dom.button('board-providers', 'All providers', 'BoardBackButton'),
            Dom.heading(3, 'BoardProviderTitle', 'Connect a Trello board'),
          ]),
          Dom.div('BoardIntro', [
            Dom.textNode(
              'Bring your lists and cards into the editor. Add, edit, and move cards here to update them in Trello.',
            ),
          ]),
          ...renderConnection(state),
          ...(rememberedIds.length > 0 && !searchQuery
            ? [
                Dom.div('BoardRemembered', [
                  Dom.heading(3, 'BoardRememberedTitle', 'Remembered boards'),
                  ...rememberedIds.map((id) => {
                    const board = boards.find((item) => item.id === id)
                    return board
                      ? renderBoardTile({ ...board, id }, loading)
                      : renderBoardTile(
                          { id, name: id },
                          loading,
                          `Open remembered board ${id}`,
                        )
                  }),
                ]),
              ]
            : []),
        ]),
  ])
}

const renderBadges = (card: Readonly<TrelloCard>): readonly Dom.Node[] => {
  const badges: Dom.Node[] = []
  for (const [count, label, icon] of [
    [card.commentCount, 'comment', 'Comment'],
    [card.attachmentCount, 'attachment', 'Attachment'],
  ] as const) {
    if (!count) continue
    const description = `${count} ${label}${count === 1 ? '' : 's'}`
    badges.push(
      Dom.node(
        VirtualDomElements.Span,
        {
          ariaLabel: description,
          className: 'BoardCardBadge',
          role: 'img',
          title: description,
        },
        [
          Dom.node(VirtualDomElements.Span, {
            ariaHidden: true,
            className: mergeClassNames(
              'BoardCardBadgeIcon',
              `BoardCardBadge${icon}Icon`,
            ),
          }),
          Dom.textNode(String(count)),
        ],
      ),
    )
  }
  return badges.length > 0 ? [Dom.div('BoardCardBadges', badges)] : []
}

const detailEmptyText = (
  loading: boolean | undefined,
  error: string | undefined,
): string => {
  if (loading) return 'Loading attachments…'
  return error ? 'Attachments unavailable' : 'No attachments'
}

const renderActivity = (state: BoardState): Dom.Node => {
  const { details, detailsError, detailsLoading } = state
  const emptyActivity =
    !detailsLoading && !detailsError
      ? [
          Dom.div('BoardDetailEmpty', [
            Dom.textNode('No comments or activity yet'),
          ]),
        ]
      : []
  return Dom.node(
    VirtualDomElements.Section,
    {
      ariaLabel: 'Comments and activity',
      className: 'BoardDialogActivity',
    },
    [
      Dom.heading(3, 'BoardDetailHeading', 'Comments and activity'),
      ...(detailsLoading
        ? [
            Dom.node(
              VirtualDomElements.Div,
              { className: 'BoardDetailEmpty', role: 'status' },
              [Dom.textNode('Loading card details…')],
            ),
          ]
        : []),
      ...(detailsError
        ? [
            Dom.node(
              VirtualDomElements.Div,
              { className: 'BoardDetailsError', role: 'alert' },
              [
                Dom.textNode(detailsError),
                Dom.button(
                  'board-card-details-retry',
                  'Try again',
                  'BoardButton',
                ),
              ],
            ),
          ]
        : []),
      ...(details?.activities.length
        ? details.activities.map((activity) =>
            Dom.div('BoardActivity', [
              Dom.div('BoardActivityAuthor', [Dom.textNode(activity.author)]),
              Dom.div('BoardActivityText', [Dom.textNode(activity.text)]),
              Dom.div('BoardActivityDate', [
                Dom.textNode(
                  Number.isNaN(Date.parse(activity.date))
                    ? activity.date
                    : new Date(activity.date).toLocaleString(),
                ),
              ]),
            ]),
          )
        : emptyActivity),
    ],
  )
}

const renderCardDialog = (state: BoardState): Dom.Node | undefined => {
  const {
    board,
    details,
    detailsError,
    detailsLoading,
    editDesc,
    editDescription,
    editError,
    editingCard,
    editName,
    savingCard,
  } = state
  if (!editingCard) return undefined
  const disabled = Boolean(savingCard || detailsLoading || detailsError)
  const status =
    board?.lists.find((list) => list.id === editingCard.idList)?.name ||
    'Unknown list'
  return Dom.node(
    VirtualDomElements.Div,
    {
      ariaLabel: 'Edit Trello card',
      ariaModal: true,
      className: 'BoardDialogOverlay',
      onClick: 'handleDialogOverlayClick',
      onKeyDown: 'handleDialogKeyDown',
      role: 'dialog',
      tabIndex: -1,
    },
    [
      Dom.div('BoardDialog', [
        Dom.div('BoardDialogHeader', [
          Dom.node(
            VirtualDomElements.Span,
            { ariaLabel: `Status: ${status}`, className: 'BoardCardStatus' },
            [Dom.textNode(status)],
          ),
          Dom.button('board-card-cancel', '', 'BoardDialogClose', {
            ariaLabel: 'Close card',
            disabled: Boolean(savingCard),
          }),
        ]),
        Dom.div('BoardDialogBody', [
          Dom.form('board-card-edit', 'BoardDialogMain', [
            Dom.heading(2, 'BoardDialogTitle', 'Edit card'),
            input('edit-card-name', 'Title', editName, Boolean(savingCard)),
            Dom.node(
              VirtualDomElements.Section,
              {
                ariaLabel: 'Description',
                className: 'BoardDescriptionSection',
              },
              [
                Dom.div('BoardDescriptionHeader', [
                  Dom.heading(3, 'BoardDetailHeading', 'Description'),
                  Dom.node(VirtualDomElements.Input, {
                    ariaLabel: editDescription ? 'Preview' : 'Edit description',
                    className: 'BoardButton',
                    ...(disabled && { disabled: true }),
                    inputType: 'button',
                    name: 'board-description-edit',
                    onClick: 'handleClick',
                    value: editDescription ? 'Preview' : 'Edit description',
                  }),
                ]),
                ...(editDescription
                  ? [
                      Dom.node(
                        VirtualDomElements.Label,
                        { className: 'BoardField' },
                        [
                          Dom.textNode('Markdown source'),
                          Dom.node(VirtualDomElements.TextArea, {
                            ariaLabel: 'Markdown source',
                            className: descriptionInputClass,
                            ...(disabled && { disabled: true }),
                            name: 'edit-card-desc',
                            onInput: 'handleInput',
                            value: editDesc || '',
                          }),
                        ],
                      ),
                    ]
                  : [
                      editDesc
                        ? renderDescriptionMarkdown(editDesc)
                        : Dom.div('BoardDetailEmpty', [
                            Dom.textNode('No description'),
                          ]),
                    ]),
              ],
            ),
            Dom.node(
              VirtualDomElements.Section,
              { ariaLabel: 'Attachments', className: 'BoardAttachments' },
              [
                Dom.heading(3, 'BoardDetailHeading', 'Attachments'),
                ...(details?.attachments.length
                  ? details.attachments.map((attachment) =>
                      Dom.link(
                        attachment.url,
                        attachment.name,
                        'BoardAttachment',
                      ),
                    )
                  : [
                      Dom.div('BoardDetailEmpty', [
                        Dom.textNode(
                          detailEmptyText(detailsLoading, detailsError),
                        ),
                      ]),
                    ]),
              ],
            ),
            ...(editError
              ? [
                  Dom.node(
                    VirtualDomElements.Div,
                    { className: 'BoardDialogError', role: 'alert' },
                    [Dom.textNode(editError)],
                  ),
                ]
              : []),
            Dom.div('BoardDialogActions', [
              Dom.button('board-card-cancel', 'Cancel', 'BoardButton', {
                disabled: Boolean(savingCard),
              }),
              Dom.node(
                VirtualDomElements.Button,
                {
                  buttonType: 'submit',
                  className: primaryButtonClass,
                  disabled: disabled || !(editName || '').trim(),
                },
                [Dom.textNode(savingCard ? 'Saving…' : 'Save changes')],
              ),
            ]),
          ]),
          renderActivity(state),
        ]),
      ]),
    ],
  )
}

const renderError = (state: Readonly<BoardState>): Dom.Node | undefined => {
  const { authorizationUrl, board, error, loading } = state
  if (!error) return undefined
  return Dom.node(
    VirtualDomElements.Div,
    { className: 'BoardError', role: 'alert' },
    [
      Dom.heading(2, 'BoardErrorTitle', error.code),
      Dom.textNode(error.message),
      ...(error.code === 'TRELLO_REAUTHORIZE_REQUIRED'
        ? [
            Dom.button('board-reconnect', 'Reconnect Trello', 'BoardButton'),
            ...(authorizationUrl
              ? [
                  Dom.link(
                    authorizationUrl,
                    'Continue to Trello',
                    primaryButtonClass,
                  ),
                ]
              : []),
          ]
        : []),
      Dom.button(
        board ? 'board-retry' : 'board-check-account',
        'Try again',
        'BoardButton',
        { disabled: loading },
      ),
    ],
  )
}

const renderColumns = (
  state: BoardState,
  board: TrelloBoard,
  cardsByList: Readonly<ReadonlyMap<string, readonly Readonly<Dom.Node>[]>>,
  dropTargetId?: string,
): Dom.Node =>
  Dom.node(
    VirtualDomElements.Div,
    { ariaLabel: board.name, className: 'BoardColumns', tabIndex: 0 },
    board.lists.map((list) =>
      Dom.node(
        VirtualDomElements.Section,
        {
          ariaLabel: list.name,
          className: `BoardColumn${dropTargetId === list.id ? ' BoardCardsDropTarget' : ''}`,
          name: `board-list:${list.id}`,
          onDragOver: 'handleBoardDragOver',
          onDrop: 'handleBoardDrop',
        },
        [
          Dom.div('BoardColumnHeader', [
            Dom.heading(
              2,
              'BoardColumnTitle',
              `${list.name} (${cardsByList.get(list.id)?.length || 0})`,
            ),
            Dom.button(
              `list-actions:${list.id}`,
              '…',
              'BoardButton BoardListActionsButton',
              {
                ariaLabel: `List actions for ${list.name}`,
                title: 'List actions',
              },
            ),
          ]),
          Dom.div(
            'BoardCards',
            cardsByList.get(list.id) || [
              Dom.div('BoardEmptyList', [Dom.textNode('No cards')]),
            ],
          ),
          renderComposer(state, list.id, list.name),
        ],
      ),
    ),
  )

const renderToolbar = (state: BoardState): Dom.Node => {
  const { board, cardDraft, loading, optionsOpen } = state
  return Dom.node(
    VirtualDomElements.Div,
    {
      className: board
        ? 'BoardToolbar'
        : 'BoardToolbar BoardToolbarWithoutBoard',
    },
    [
      Dom.heading(1, 'BoardTitle', board?.name || 'Boards'),
      ...(board ? [renderBoardSearch(state)] : []),
      ...(board
        ? [
            Dom.div(
              'BoardOverflow',
              [
                Dom.button(
                  'board-options',
                  '…',
                  'BoardButton BoardOptionsButton',
                  {
                    ariaExpanded: Boolean(optionsOpen),
                    ariaLabel: 'More board options',
                    disabled: loading,
                  },
                ),
                ...(optionsOpen
                  ? [
                      Dom.node(
                        VirtualDomElements.Div,
                        {
                          ariaLabel: 'Board options',
                          className: 'BoardOverflowMenu',
                          role: 'group',
                        },
                        [
                          Dom.button(
                            'board-refresh',
                            'Refresh board',
                            'BoardButton',
                            {
                              disabled: loading || Boolean(cardDraft?.saving),
                            },
                          ),
                          Dom.button(
                            'board-change',
                            'Connect another board',
                            'BoardButton',
                          ),
                          Dom.button(
                            'board-disconnect',
                            'Forget board',
                            'BoardButton',
                          ),
                          Dom.button(
                            'board-disconnect-account',
                            'Disconnect Trello',
                            'BoardButton',
                            { disabled: loading },
                          ),
                        ],
                      ),
                    ]
                  : []),
              ],
              { onKeyDown: 'handleDialogKeyDown' },
            ),
          ]
        : []),
    ],
  )
}

const getBoardStyle = (board: TrelloBoard | undefined): string | undefined => {
  if (!board) return undefined
  const backgroundImage = board.backgroundImage
    ? `url("${board.backgroundImage}")`
    : board.backgroundGradient
  return [
    board.backgroundColor && `background-color:${board.backgroundColor}`,
    backgroundImage && `background-image:${backgroundImage}`,
  ]
    .filter(Boolean)
    .join(';')
}

const renderCardLabels = (
  labels: TrelloCard['labels'],
): readonly Dom.Node[] => {
  if (!labels?.length) return []
  return [
    Dom.div(
      'BoardCardLabels',
      labels.map((label) =>
        Dom.node(VirtualDomElements.Span, {
          ariaLabel: label.name,
          className: mergeClassNames(
            'BoardCardLabel',
            `BoardCardLabel-${label.color}`,
          ),
          role: 'img',
        }),
      ),
    ),
  ]
}

export const render = (state: BoardState): Dom.Node => {
  const {
    authorizing,
    board,
    draggedCardId,
    dropTargetId,
    editingCard,
    loading,
  } = state
  const cards = board?.cards || []
  const cardsByList = new Map<string, Dom.Node[]>()
  for (const card of cards) {
    const cards = cardsByList.get(card.idList) || []
    cards.push(
      Dom.node(
        VirtualDomElements.Button,
        {
          buttonType: 'button',
          className: mergeClassNames(
            cardButtonClass,
            draggedCardId === card.id ? 'BoardCardDragging' : '',
          ),
          draggable: !editingCard && !loading,
          name: `board-card:${card.id}`,
          onClick: 'handleClick',
          onDragEnd: 'handleBoardDragEnd',
          onDragStart: 'handleBoardDragStart',
        },
        [
          ...(card.coverDataUrl
            ? [
                Dom.node(VirtualDomElements.Img, {
                  alt: '',
                  className: 'BoardCardCover',
                  loading: 'lazy',
                  src: card.coverDataUrl,
                }),
              ]
            : []),
          ...renderCardLabels(card.labels),
          Dom.div('BoardCardTitle', [Dom.textNode(card.name)]),
          ...renderBadges(card),
        ],
      ),
    )
    cardsByList.set(card.idList, cards)
  }
  const cardDialog = renderCardDialog(state)
  const errorNode = renderError(state)
  return Dom.node(
    VirtualDomElements.Div,
    {
      className: mergeClassNames('BoardView', board ? 'BoardViewTrello' : ''),
      style: getBoardStyle(board),
    },
    [
      renderToolbar(state),
      ...(errorNode ? [errorNode] : []),
      ...(board
        ? [
            renderColumns(state, board, cardsByList, dropTargetId),
            ...(board.lists.length === 0
              ? [
                  Dom.div('BoardEmpty', [
                    Dom.textNode('This board has no open lists yet.'),
                  ]),
                ]
              : []),
          ]
        : [renderSetup(state)]),
      ...(loading || authorizing
        ? [
            Dom.node(
              VirtualDomElements.Div,
              { className: 'BoardStatus', role: 'status' },
              [
                Dom.textNode(
                  authorizing
                    ? 'Waiting for Trello authorization…'
                    : 'Loading…',
                ),
              ],
            ),
          ]
        : []),
      ...(cardDialog ? [cardDialog] : []),
    ],
  )
}
