import type { VirtualDomNode } from '@lvce-editor/virtual-dom-worker'
import type { TrelloViewState } from '../state/TrelloViewState.ts'
import * as Dom from '../../VirtualDom/VirtualDom.ts'
import { renderError, renderField, renderTitle } from './RenderShared.ts'
import { renderWelcome } from './RenderWelcome.ts'

export const renderAuth = (
  state: Readonly<TrelloViewState>,
): readonly VirtualDomNode[] => {
  const title = renderTitle('Trello')
  const apiKey = renderField('API key', 'apiKey', state.draftApiKey)
  const token = renderField('Token', 'token', state.draftToken, 'password')
  const connect = Dom.button(
    'connect',
    state.loading ? 'Connecting...' : 'Connect',
  )
  return Dom.flatten(
    Dom.div('TrelloView TrelloAuth', [
      title,
      apiKey,
      token,
      connect,
      ...renderError(state.error),
      renderWelcome(),
    ]),
  )
}
