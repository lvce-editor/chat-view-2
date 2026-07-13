const remotePrefix = '/remote'

const toBrowserUrl = (url: URL): string => {
  if (url.protocol !== 'file:') {
    return url.href
  }
  return `${remotePrefix}${url.pathname}`
}

export const getAssetBaseUrl = (moduleUrl: string): string => {
  const relativePath = moduleUrl.includes('/src/parts/TrelloView/state/')
    ? '../../../../'
    : '../'
  const url = new URL(relativePath, moduleUrl)
  return toBrowserUrl(url)
}

export const getAssetUrl = (baseUrl: string, name: string): string => {
  return `${baseUrl}${name}`
}
