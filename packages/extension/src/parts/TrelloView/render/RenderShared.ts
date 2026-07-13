import { VirtualDomElements } from '@lvce-editor/virtual-dom-worker'
import * as Dom from '../../VirtualDom/VirtualDom.ts'

export const renderError = (error: string): readonly Dom.TreeNode[] => {
  if (!error) {
    return []
  }
  return [Dom.div('TrelloError', [Dom.textNode(error)])]
}

export const renderTitle = (text: string): Dom.TreeNode => {
  return Dom.node(VirtualDomElements.H2, { className: 'TrelloTitle' }, [
    Dom.textNode(text),
  ])
}

export const renderListTitle = (text: string): Dom.TreeNode => {
  return Dom.node(VirtualDomElements.H3, { className: 'TrelloListTitle' }, [
    Dom.textNode(text),
  ])
}

export const renderToolbar = (
  children: readonly Dom.TreeNode[],
): Dom.TreeNode => {
  return Dom.div('TrelloToolbar', children)
}

export const renderField = (
  label: string,
  name: string,
  value: string,
  inputType?: string,
): Dom.TreeNode => {
  return Dom.div('TrelloField', [
    Dom.label(label),
    Dom.input(name, value, label, inputType),
  ])
}

export const renderTextAreaField = (
  label: string,
  name: string,
  value: string,
): Dom.TreeNode => {
  return Dom.div('TrelloField', [
    Dom.textNode(label),
    Dom.textArea(name, value, label),
  ])
}
