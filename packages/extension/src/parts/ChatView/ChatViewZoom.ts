export const getZoomCommand = (
  key: unknown,
  ctrlKey: unknown,
  metaKey: unknown,
  shiftKey: unknown,
): 'Window.zoomIn' | 'Window.zoomOut' | undefined => {
  if (ctrlKey !== true && metaKey !== true) {
    return undefined
  }
  if (key === '-' || key === '_') {
    return 'Window.zoomOut'
  }
  if (key === '+' || (key === '=' && shiftKey === true)) {
    return 'Window.zoomIn'
  }
  return undefined
}
