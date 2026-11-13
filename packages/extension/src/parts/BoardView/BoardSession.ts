import type { TrelloBoard } from './Trello.ts'

export interface BoardConnection {
  readonly board: TrelloBoard
}

export interface BoardSession {
  readonly get: (id: string) => BoardConnection | undefined
  readonly remove: (id: string) => void
  readonly set: (id: string, connection: BoardConnection) => void
}

// Sidebar views are disposed when changing layouts. Keep session connections
// in the isolated extension host, never in component state or preferences.
export const createSession = (): BoardSession => {
  const connections = new Map<string, BoardConnection>()
  return {
    get: (id) => connections.get(id),
    remove: (id): void => {
      connections.delete(id)
    },
    set: (id, connection): void => {
      connections.set(id, connection)
    },
  }
}
