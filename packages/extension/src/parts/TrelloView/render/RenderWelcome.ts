import { VirtualDomElements } from '@lvce-editor/virtual-dom-worker'
import * as Dom from '../../VirtualDom/VirtualDom.ts'
import { trelloPowerUpsUrl } from '../Constants.ts'

const renderWelcomeText = (text: string): Dom.TreeNode => {
  return Dom.div('TrelloWelcomeText', [Dom.textNode(text)])
}

const renderWelcomeNote = (text: string): Dom.TreeNode => {
  return Dom.div('TrelloWelcomeNote', [Dom.textNode(text)])
}

const renderWelcomeStep = (
  number: string,
  children: readonly Dom.TreeNode[],
): Dom.TreeNode => {
  return Dom.node(VirtualDomElements.Li, { className: 'TrelloWelcomeStep' }, [
    Dom.node(
      VirtualDomElements.Span,
      { className: 'TrelloWelcomeStepNumber' },
      [Dom.textNode(number)],
    ),
    Dom.node(VirtualDomElements.Span, { className: 'TrelloWelcomeStepText' }, [
      ...children,
    ]),
  ])
}

const renderWelcomeSteps = (): Dom.TreeNode => {
  return Dom.node(VirtualDomElements.Ol, { className: 'TrelloWelcomeSteps' }, [
    renderWelcomeStep('1', [
      Dom.textNode('Create or open a Trello Power-Up at '),
      Dom.link('TrelloWelcomeLink', trelloPowerUpsUrl, trelloPowerUpsUrl),
      Dom.textNode('.'),
    ]),
    renderWelcomeStep('2', [
      Dom.textNode('Open the API Key tab and generate an API key.'),
    ]),
    renderWelcomeStep('3', [
      Dom.textNode(
        "Use that key to generate a token from Trello's authorization page, then paste both values here.",
      ),
    ]),
  ])
}

export const renderWelcome = (): Dom.TreeNode => {
  return Dom.div('TrelloWelcome', [
    Dom.node(VirtualDomElements.H3, { className: 'TrelloWelcomeTitle' }, [
      Dom.textNode('Welcome to Trello'),
    ]),
    renderWelcomeText(
      'Connect your Trello account to browse your boards from Lvce Editor.',
    ),
    renderWelcomeSteps(),
    renderWelcomeNote(
      'The API key identifies the app. The token grants access to your Trello account, so keep the token private.',
    ),
  ])
}
