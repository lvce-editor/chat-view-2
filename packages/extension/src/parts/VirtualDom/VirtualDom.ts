import {
  text,
  VirtualDomElements,
  type VirtualDomNode,
} from '@lvce-editor/virtual-dom-worker'

export interface TreeNode {
  readonly children: readonly TreeNode[]
  readonly node: VirtualDomNode
}

const headingTypes = [
  VirtualDomElements.H1,
  VirtualDomElements.H2,
  VirtualDomElements.H3,
  VirtualDomElements.H4,
  VirtualDomElements.H5,
  VirtualDomElements.H6,
]

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
  options: Readonly<{
    onClick?: string
    onDragOver?: string
    onDrop?: string
    onKeyDown?: string
    name?: string
    style?: string
  }> = {},
): TreeNode => {
  return node(
    VirtualDomElements.Div,
    {
      className,
      ...(options.onClick && { onClick: options.onClick }),
      ...(options.style && { style: options.style }),
      ...(options.onDragOver && { onDragOver: options.onDragOver }),
      ...(options.onDrop && { onDrop: options.onDrop }),
      ...(options.onKeyDown && { onKeyDown: options.onKeyDown }),
      ...(options.name && { name: options.name }),
    },
    children,
  )
}

export const link = (
  href: string,
  label: string,
  className: string,
): TreeNode => {
  return node(
    VirtualDomElements.A,
    {
      className,
      href,
      rel: 'noopener noreferrer',
      target: '_blank',
      title: href,
    },
    [textNode(label)],
  )
}

export const button = (
  name: string,
  label: string,
  className: string,
  options: Readonly<{
    ariaLabel?: string
    ariaExpanded?: boolean
    disabled?: boolean
    onClick?: string
    onMouseDown?: string
    title?: string
  }> = {},
): TreeNode => {
  return node(
    VirtualDomElements.Button,
    {
      buttonType: 'button',
      className,
      ...(options.ariaLabel && { ariaLabel: options.ariaLabel }),
      ...(typeof options.ariaExpanded === 'boolean' && {
        ariaExpanded: options.ariaExpanded,
      }),
      ...(options.disabled && { disabled: true }),
      name,
      onClick: options.onClick || 'handleClick',
      ...(options.onMouseDown && { onMouseDown: options.onMouseDown }),
      ...(options.title && { title: options.title }),
    },
    [textNode(label)],
  )
}

export const iconButton = (
  name: string,
  className: string,
  iconClassName: string,
  ariaLabel: string,
  title = ariaLabel,
): TreeNode => {
  return node(
    VirtualDomElements.Button,
    {
      ariaLabel,
      buttonType: 'button',
      className,
      name,
      onClick: 'handleClick',
      title,
    },
    [div(iconClassName, [])],
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
  level: 1 | 2 | 3 | 4 | 5 | 6,
  className: string,
  value: string | readonly TreeNode[],
  options: Readonly<{ name?: string; onContextMenu?: string }> = {},
): TreeNode => {
  const type = headingTypes[level - 1]
  return node(
    type,
    {
      className,
      ...(options.name && { name: options.name }),
      ...(options.onContextMenu && { onContextMenu: options.onContextMenu }),
    },
    typeof value === 'string' ? [textNode(value)] : value,
  )
}

export const textArea = (
  value: string,
  placeholder: string,
  options: Readonly<{ onPaste?: string }> = {},
): TreeNode => {
  return node(VirtualDomElements.TextArea, {
    ariaLabel: 'Message',
    className: 'ChatComposerInput',
    name: 'composer',
    onBlur: 'handleBlur',
    onFocus: 'handleFocus',
    onInput: 'handleInput',
    ...(options.onPaste && { onPaste: options.onPaste }),
    placeholder,
    rows: 1,
    spellcheck: true,
    value,
  })
}

export const flatten = (tree: TreeNode): readonly VirtualDomNode[] => {
  return [tree.node, ...tree.children.flatMap(flatten)]
}
