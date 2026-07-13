import {
  VirtualDomElements,
  type VirtualDomNode,
} from '@lvce-editor/virtual-dom-worker'
import type {
  TrelloBoardDetail,
  TrelloList,
} from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloViewState } from '../state/TrelloViewState.ts'
import * as Dom from '../../VirtualDom/VirtualDom.ts'
import {
  getBoardBackgroundClassName,
  getBoardBackgroundStyle,
} from './BoardBackground.ts'
import { renderCardDetailPanel } from './RenderCardDetailPanel.ts'
import { renderCards } from './RenderCards.ts'
import { renderError } from './RenderShared.ts'

const renderListTitleInput = (
  state: Readonly<TrelloViewState>,
  list: Readonly<TrelloList>,
): Dom.TreeNode => {
  return Dom.node(VirtualDomElements.Input, {
    className: 'TrelloListTitleInput',
    name: `listTitle:${list.id}`,
    onBlur: 'handleBlur',
    onFocus: 'handleFocus',
    onInput: 'handleInput',
    value: state.draftListTitles[list.id] ?? list.name,
  })
}

const renderListCardCount = (list: Readonly<TrelloList>): Dom.TreeNode => {
  return Dom.div('TrelloListCardCount', [
    Dom.textNode(String(list.cards.length)),
  ])
}

const renderListHeader = (
  state: Readonly<TrelloViewState>,
  list: Readonly<TrelloList>,
): Dom.TreeNode => {
  return Dom.div('TrelloListHeader', [
    renderListTitleInput(state, list),
    renderListCardCount(list),
  ])
}

const renderAddCardButton = (list: Readonly<TrelloList>): Dom.TreeNode => {
  return Dom.button(`addCard:${list.id}`, '+ Add a card', 'TrelloAddCardButton')
}

const renderAddCardInput = (
  state: Readonly<TrelloViewState>,
  list: Readonly<TrelloList>,
): Dom.TreeNode => {
  return Dom.form(`addCard:${list.id}`, 'TrelloAddCardForm', [
    Dom.node(VirtualDomElements.TextArea, {
      autocomplete: 'off',
      className: 'TrelloAddCardInput',
      disabled: state.savingNewCard,
      name: `newCardTitle:${list.id}`,
      onBlur: 'handleBlur',
      onFocus: 'handleFocus',
      onInput: 'handleInput',
      onKeyDown: 'handleKeyDown',
      placeholder: 'Enter a title for this card',
      rows: 2,
      value: state.draftNewCardTitle,
    }),
  ])
}

const renderAddCardControl = (
  state: Readonly<TrelloViewState>,
  list: Readonly<TrelloList>,
): Dom.TreeNode => {
  if (state.addingCardListId === list.id) {
    return renderAddCardInput(state, list)
  }
  return renderAddCardButton(list)
}

const renderAddListControl = (
  state: Readonly<TrelloViewState>,
): Dom.TreeNode => {
  if (state.addingList) {
    return Dom.form('addList', 'TrelloAddListForm', [
      Dom.node(VirtualDomElements.Input, {
        autocomplete: 'off',
        className: 'TrelloAddListInput',
        disabled: state.savingNewList,
        name: 'newListTitle',
        onFocus: 'handleFocus',
        onInput: 'handleInput',
        onKeyDown: 'handleKeyDown',
        placeholder: 'Enter list title',
        value: state.draftNewListTitle,
      }),
    ])
  }
  return Dom.button('startAddList', 'Create New list', 'TrelloAddListButton')
}

const renderBoardDetailContent = (
  state: Readonly<TrelloViewState>,
  lists: readonly Readonly<Dom.TreeNode>[],
): readonly Dom.TreeNode[] => {
  if (state.loading) {
    return [Dom.textNode('Loading board...')]
  }
  return [
    Dom.div('TrelloBoardDetailContent', [
      Dom.div('TrelloLists', [...lists, renderAddListControl(state)]),
      ...renderCardDetailPanel(state),
    ]),
  ]
}

const getListClassName = (
  state: Readonly<TrelloViewState>,
  list: Readonly<TrelloList>,
): string => {
  if (state.dragTargetListId === list.id) {
    return 'TrelloList TrelloListDragTarget'
  }
  return 'TrelloList'
}

export const renderBoardDetail = (
  state: Readonly<TrelloViewState>,
  detail: Readonly<TrelloBoardDetail>,
): readonly VirtualDomNode[] => {
  const lists = detail.lists.map((list) => {
    const cards = renderCards(state.baseUrl, state.coverImageUrls, list.cards)
    return Dom.node(
      VirtualDomElements.Div,
      {
        className: getListClassName(state, list),
        name: `list:${list.id}`,
        onClick: 'handleClick',
        onContextMenu: 'handleContextMenu',
        onDragLeave: 'handleDragLeave',
        onDragOver: 'handleDragOver',
        onDrop: 'handleDrop',
      },
      [
        renderListHeader(state, list),
        Dom.div('TrelloCards', cards),
        renderAddCardControl(state, list),
      ],
    )
  })
  const children = [
    ...renderBoardDetailContent(state, lists),
    ...renderError(state.error),
  ]
  return Dom.flatten(
    Dom.node(
      VirtualDomElements.Div,
      {
        className: getBoardBackgroundClassName(
          detail.board,
          state.boardBackgroundEnabled,
        ),
        style: getBoardBackgroundStyle(
          detail.board,
          state.boardBackgroundEnabled,
        ),
      },
      children,
    ),
  )
}
