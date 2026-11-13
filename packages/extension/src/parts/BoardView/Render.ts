/* eslint-disable unicorn/max-nested-calls */
import {
  mergeClassNames,
  VirtualDomElements,
} from '@lvce-editor/virtual-dom-worker'
import type { BoardError, TrelloBoard } from './Trello.ts'
import * as Dom from '../VirtualDom/VirtualDom.ts'

const primaryButtonClass = mergeClassNames('BoardButton', 'BoardPrimaryButton')

export interface BoardState {
  readonly accountConnected?: boolean
  readonly authorizationUrl?: string | undefined
  readonly authorizing?: boolean
  readonly board: TrelloBoard | undefined
  readonly boardId: string
  readonly connectedIds: readonly string[]
  readonly error: BoardError | undefined
  readonly loading: boolean
  readonly providerSelected: boolean
}

const input = (name: string, label: string, value?: string): Dom.Node =>
  Dom.node(VirtualDomElements.Label, { className: 'BoardField' }, [
    Dom.textNode(label),
    Dom.node(VirtualDomElements.Input, {
      ariaLabel: label,
      autoComplete: 'off',
      className: 'BoardInput',
      inputType: 'text',
      name,
      onInput: 'handleInput',
      spellcheck: false,
      ...(value !== undefined && { value }),
    }),
  ])

const renderConnection = (state: BoardState): readonly Dom.Node[] => {
  const { accountConnected, authorizationUrl, authorizing, boardId, loading } =
    state
  return accountConnected
    ? [
        Dom.div('BoardCredentialsHelp', [
          Dom.textNode(
            'Trello is connected. Enter a board URL or ID to open it.',
          ),
        ]),
        Dom.form('board-connect', 'BoardConnect', [
          input('board-id', 'Board URL or ID', boardId),
          Dom.node(
            VirtualDomElements.Button,
            {
              buttonType: 'submit',
              className: primaryButtonClass,
              disabled: loading,
            },
            [Dom.textNode('Open board')],
          ),
        ]),
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
              'Bring your lists and cards into the editor. This view is read-only; changes stay in Trello.',
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

export const render = (state: BoardState): Dom.Node => {
  const { accountConnected, authorizing, board, error, loading } = state
  const cards = board?.cards || []
  const cardsByList = new Map<string, Dom.Node[]>()
  for (const card of cards) {
    const cards = cardsByList.get(card.idList) || []
    cards.push(
      Dom.div('BoardCard', [
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
      ]),
    )
    cardsByList.set(card.idList, cards)
  }
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
                accountConnected ? 'board-retry' : 'board-check-account',
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
  ])
}
