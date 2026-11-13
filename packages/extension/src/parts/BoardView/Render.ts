/* eslint-disable unicorn/max-nested-calls */
import {
  mergeClassNames,
  VirtualDomElements,
} from '@lvce-editor/virtual-dom-worker'
import type {
  BoardError,
  TrelloBoard,
  TrelloBoardSummary,
  TrelloCard,
} from './Trello.ts'
import * as Dom from '../VirtualDom/VirtualDom.ts'

const primaryButtonClass = mergeClassNames('BoardButton', 'BoardPrimaryButton')
const cardButtonClass = mergeClassNames('BoardCard', 'BoardCardButton')
const descriptionInputClass = mergeClassNames(
  'BoardInput',
  'BoardDescriptionInput',
)

export interface BoardState {
  readonly accountConnected?: boolean
  readonly authorizationUrl?: string | undefined
  readonly authorizing?: boolean
  readonly board: TrelloBoard | undefined
  readonly boardId: string
  readonly boards: readonly TrelloBoardSummary[]
  readonly connectedIds: readonly string[]
  readonly editDesc?: string
  readonly editError?: string | undefined
  readonly editingCard?: TrelloCard | undefined
  readonly editName?: string
  readonly error: BoardError | undefined
  readonly loading: boolean
  readonly providerSelected: boolean
  readonly savingCard?: boolean
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
      onInput: 'handleInput',
      spellcheck: false,
      ...(name === 'edit-card-name' && { autoFocus: true }),
      ...(value !== undefined && { value }),
    }),
  ])

const boardSelect = (state: BoardState): Dom.Node => {
  const { boardId, boards, loading } = state
  return Dom.node(VirtualDomElements.Label, { className: 'BoardField' }, [
    Dom.textNode('Trello board'),
    Dom.node(
      VirtualDomElements.Select,
      {
        ariaLabel: 'Trello board',
        className: 'BoardInput',
        disabled: loading || boards.length === 0,
        name: 'board-id',
        onInput: 'handleInput',
      },
      [
        Dom.node(
          VirtualDomElements.Option,
          {
            selected: boards.every((board) => board.id !== boardId),
            value: '',
          },
          [Dom.textNode(loading ? 'Loading boards…' : 'Select a board')],
        ),
        ...boards.map((board) =>
          Dom.node(
            VirtualDomElements.Option,
            { selected: board.id === boardId, value: board.id },
            [Dom.textNode(board.name)],
          ),
        ),
      ],
    ),
  ])
}

const connectionHelp = (state: BoardState): string => {
  const { boards, error, loading } = state
  if (loading) return 'Loading your Trello boards…'
  if (boards.length === 0 && !error)
    return 'No open boards found. Create a board in Trello, then refresh this list.'
  return 'Trello is connected. Select a board to open it.'
}

const renderConnection = (state: BoardState): readonly Dom.Node[] => {
  const {
    accountConnected,
    authorizationUrl,
    authorizing,
    boardId,
    boards,
    loading,
  } = state
  return accountConnected
    ? [
        Dom.div('BoardCredentialsHelp', [Dom.textNode(connectionHelp(state))]),
        Dom.form('board-connect', 'BoardConnect', [
          boardSelect(state),
          Dom.node(
            VirtualDomElements.Button,
            {
              buttonType: 'submit',
              className: primaryButtonClass,
              disabled:
                loading || boards.every((board) => board.id !== boardId),
            },
            [Dom.textNode('Open board')],
          ),
        ]),
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
              : 'Sign in to LVCE, then authorize Trello to read your boards.',
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
  const { connectedIds, providerSelected } = state
  const showProviderGrid = !providerSelected
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
              'Bring your lists and cards into the editor. Edit a card to update it in Trello.',
            ),
          ]),
          ...renderConnection(state),
          ...(connectedIds.length > 0
            ? [
                Dom.div('BoardRemembered', [
                  Dom.heading(3, 'BoardRememberedTitle', 'Remembered boards'),
                  ...connectedIds.map((id) =>
                    Dom.button(`board-select:${id}`, id, 'BoardButton'),
                  ),
                ]),
              ]
            : []),
        ]),
  ])
}

const renderCardDialog = (state: BoardState): Dom.Node | undefined => {
  const { editDesc, editError, editingCard, editName, savingCard } = state
  if (!editingCard) return undefined
  return Dom.node(
    VirtualDomElements.Div,
    {
      ariaLabel: 'Edit Trello card',
      ariaModal: true,
      className: 'BoardDialogOverlay',
      onKeyDown: 'handleDialogKeyDown',
      role: 'dialog',
      tabIndex: -1,
    },
    [
      Dom.form('board-card-edit', 'BoardDialog', [
        Dom.heading(2, 'BoardDialogTitle', 'Edit card'),
        input('edit-card-name', 'Title', editName, savingCard),
        Dom.node(VirtualDomElements.Label, { className: 'BoardField' }, [
          Dom.textNode('Description'),
          Dom.node(VirtualDomElements.TextArea, {
            ariaLabel: 'Description',
            className: descriptionInputClass,
            ...(savingCard && { disabled: true }),
            name: 'edit-card-desc',
            onInput: 'handleInput',
            value: editDesc || '',
          }),
        ]),
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
              disabled: savingCard || !(editName || '').trim(),
            },
            [Dom.textNode(savingCard ? 'Saving…' : 'Save changes')],
          ),
        ]),
      ]),
    ],
  )
}

export const render = (state: BoardState): Dom.Node => {
  const { authorizing, board, error, loading } = state
  const cards = board?.cards || []
  const cardsByList = new Map<string, Dom.Node[]>()
  for (const card of cards) {
    const cards = cardsByList.get(card.idList) || []
    cards.push(
      Dom.node(
        VirtualDomElements.Button,
        {
          buttonType: 'button',
          className: cardButtonClass,
          name: `board-card:${card.id}`,
          onClick: 'handleClick',
        },
        [
          ...(card.coverUrl
            ? [
                Dom.node(VirtualDomElements.Img, {
                  alt: '',
                  className: 'BoardCardCover',
                  loading: 'lazy',
                  src: card.coverUrl,
                }),
              ]
            : []),
          Dom.div('BoardCardTitle', [Dom.textNode(card.name)]),
        ],
      ),
    )
    cardsByList.set(card.idList, cards)
  }
  const cardDialog = renderCardDialog(state)
  return Dom.div(mergeClassNames('BoardView', board ? 'BoardViewTrello' : ''), [
    Dom.div('BoardToolbar', [
      Dom.heading(1, 'BoardTitle', board?.name || 'Boards'),
      Dom.button('board-chat', 'Chat', 'BoardButton'),
      Dom.button('board-ide', 'IDE layout', 'BoardButton'),
    ]),
    ...(error
      ? [
          Dom.node(
            VirtualDomElements.Div,
            { className: 'BoardError', role: 'alert' },
            [
              Dom.heading(2, 'BoardErrorTitle', error.code),
              Dom.textNode(error.message),
              Dom.button(
                board ? 'board-retry' : 'board-check-account',
                'Try again',
                'BoardButton',
                {
                  disabled: loading,
                },
              ),
            ],
          ),
        ]
      : []),
    ...(board
      ? [
          Dom.div('BoardActions', [
            Dom.button('board-refresh', 'Refresh board', 'BoardButton', {
              disabled: loading,
            }),
            Dom.button('board-change', 'Connect another board', 'BoardButton'),
            Dom.button('board-disconnect', 'Forget board', 'BoardButton'),
            Dom.button(
              'board-disconnect-account',
              'Disconnect Trello',
              'BoardButton',
              { disabled: loading },
            ),
          ]),
          Dom.node(
            VirtualDomElements.Div,
            {
              ariaLabel: board.name,
              className: 'BoardColumns',
              tabIndex: 0,
            },
            board.lists.map((list) =>
              Dom.node(
                VirtualDomElements.Section,
                { ariaLabel: list.name, className: 'BoardColumn' },
                [
                  Dom.heading(2, 'BoardColumnTitle', list.name),
                  Dom.div(
                    'BoardCards',
                    cardsByList.get(list.id) || [
                      Dom.div('BoardEmptyList', [Dom.textNode('No cards')]),
                    ],
                  ),
                ],
              ),
            ),
          ),
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
                authorizing ? 'Waiting for Trello authorization…' : 'Loading…',
              ),
            ],
          ),
        ]
      : []),
    ...(cardDialog ? [cardDialog] : []),
  ])
}
