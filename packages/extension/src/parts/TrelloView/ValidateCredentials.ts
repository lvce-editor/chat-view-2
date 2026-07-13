import type { TrelloCredentials } from '../TrelloTypes/TrelloTypes.ts'

const apiKeyPattern = /^[A-Za-z0-9]{32}$/

export const validateCredentials = (
  credentials: Readonly<TrelloCredentials>,
): string => {
  if (!credentials.apiKey.trim() || !credentials.token.trim()) {
    return 'Enter an API key and token.'
  }
  if (!apiKeyPattern.test(credentials.apiKey)) {
    return 'API key must be 32 alphanumeric characters.'
  }
  return ''
}
