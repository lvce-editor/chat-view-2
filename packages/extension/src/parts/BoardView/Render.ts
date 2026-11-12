/* eslint-disable unicorn/max-nested-calls */
import {
  mergeClassNames,
  VirtualDomElements,
} from '@lvce-editor/virtual-dom-worker'
import type { BoardError, TrelloBoard } from './Trello.ts'
import * as Dom from '../VirtualDom/VirtualDom.ts'

const primaryButtonClass = mergeClassNames('BoardButton', 'BoardPrimaryButton')

export interface BoardState {
  readonly board: TrelloBoard | undefined
  readonly boardId: string
  readonly connectedIds: readonly string[]
  readonly error: BoardError | undefined
  readonly loading: boolean
}

const input = (name: string, label: string, value?: string): Dom.Node =>
  Dom.node(VirtualDomElements.Label, { className: 'BoardField' }, [
    Dom.textNode(label),
    Dom.node(VirtualDomElements.Input, {
      ariaLabel: label,
      autoComplete: 'off',
      className: 'BoardInput',
      inputType: name === 'board-id' ? 'text' : 'password',
      name,
      onInput: 'handleInput',
      spellcheck: false,
      ...(value !== undefined && { value }),
    }),
  ])

export const render = (state: BoardState): Dom.Node => {
  const { board, boardId, connectedIds, error, loading } = state
  const cards = board?.cards || []
  const cardsByList = new Map<string, Dom.Node[]>()
  for (const card of cards) {
    const cards = cardsByList.get(card.idList) || []
    cards.push(Dom.div('BoardCard', [Dom.textNode(card.name)]))
    cardsByList.set(card.idList, cards)
  }
  return Dom.div('BoardView', [
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
              Dom.button('board-retry', 'Try again', 'BoardButton', {
                disabled: loading,
              }),
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
            Dom.button('board-disconnect', 'Disconnect board', 'BoardButton'),
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
      : [
          Dom.div('BoardSetup', [
            Dom.heading(2, 'BoardSetupTitle', 'Connect a Trello board'),
            Dom.div('BoardIntro', [
              Dom.textNode(
                'Bring your lists and cards into the editor. This view is read-only; changes stay in Trello.',
              ),
            ]),
            Dom.div('BoardCredentialsHelp', [
              Dom.textNode(
                'Use your Trello API key and a token with read access. Your credentials stay in memory until the editor reloads. Board IDs are remembered in settings.',
              ),
            ]),
            Dom.link(
              'https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/',
              'How to get a Trello API key and token',
              'BoardHelpLink',
            ),
            Dom.form('board-connect', 'BoardConnect', [
              input('board-id', 'Board URL or ID', boardId),
              input('board-api-key', 'Trello API key'),
              input('board-token', 'Trello read token'),
              Dom.node(
                VirtualDomElements.Button,
                {
                  buttonType: 'submit',
                  className: primaryButtonClass,
                  disabled: loading,
                },
                [Dom.textNode('Connect board')],
              ),
            ]),
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
        ]),
    ...(loading
      ? [
          Dom.node(
            VirtualDomElements.Div,
            { className: 'BoardStatus', role: 'status' },
            [Dom.textNode('Loading board…')],
          ),
        ]
      : []),
  ])
}
