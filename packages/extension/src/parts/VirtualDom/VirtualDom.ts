import {
  text,
  VirtualDomElements,
  type VirtualDomNode,
} from '@lvce-editor/virtual-dom-worker'

export interface TreeNode {
  readonly children: readonly TreeNode[]
  readonly node: VirtualDomNode
}

export const textNode = (value: string): TreeNode => ({
  children: [],
  node: text(value),
})

export const node = (
  type: number,
  properties: Readonly<Record<string, unknown>> = {},
  children: readonly TreeNode[] = [],
): TreeNode => ({
  children,
  node: {
    ...properties,
    childCount: children.length,
    type,
  },
})

export const div = (
  className: string,
  children: readonly TreeNode[],
): TreeNode => {
  return node(VirtualDomElements.Div, { className }, children)
}

export const button = (
  name: string,
  label: string,
  className: string,
  options: Readonly<{
    ariaExpanded?: boolean
    disabled?: boolean
    title?: string
  }> = {},
): TreeNode => {
  return node(
    VirtualDomElements.Button,
    {
      buttonType: 'button',
      className,
      ...(typeof options.ariaExpanded === 'boolean' && {
        ariaExpanded: options.ariaExpanded,
      }),
      ...(options.disabled && { disabled: true }),
      name,
      onClick: 'handleClick',
      ...(options.title && { title: options.title }),
    },
    [textNode(label)],
  )
}

export const form = (
  name: string,
  className: string,
  children: readonly TreeNode[],
): TreeNode => {
  return node(
    VirtualDomElements.Form,
    {
      className,
      name,
      onSubmit: 'handleSubmit',
    },
    children,
  )
}

export const heading = (
  level: 1 | 2,
  className: string,
  value: string,
): TreeNode => {
  const type = level === 1 ? VirtualDomElements.H1 : VirtualDomElements.H2
  return node(type, { className }, [textNode(value)])
}

export const textArea = (value: string, placeholder: string): TreeNode => {
  return node(VirtualDomElements.TextArea, {
    ariaLabel: 'Message',
    className: 'ChatComposerInput',
    name: 'composer',
    onBlur: 'handleBlur',
    onFocus: 'handleFocus',
    onInput: 'handleInput',
    placeholder,
    spellcheck: true,
    value,
  })
}

export const flatten = (tree: TreeNode): readonly VirtualDomNode[] => {
  return [tree.node, ...tree.children.flatMap(flatten)]
}
