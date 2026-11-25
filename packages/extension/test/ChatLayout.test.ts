import { expect, test } from '@jest/globals'
import { showChatLayout } from '../src/parts/ChatLayout/ChatLayout.ts'

test.each(['ai-native', 'ide'] as const)(
  '%s keeps the previous layout until chat loads',
  async (layout) => {
    const loading = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const state = { focusMode: true }
    const show = showChatLayout(layout, {
      async executeCommand(id) {
        switch (id) {
          case 'Layout.getSideBarFocusMode': {
            return state.focusMode
          }
          case 'Layout.leaveSideBarFocusMode': {
            state.focusMode = false

            break
          }
          case 'SideBar.show': {
            started.resolve()
            await loading.promise

            break
          }
          // No default
        }
        return undefined
      },
      async setWorkbenchLayoutUrl() {},
      async toggleFocusMode() {
        state.focusMode = !state.focusMode
      },
    })
    await started.promise
    const pendingFocusMode = state.focusMode
    loading.resolve()
    await show
    expect(pendingFocusMode).toBe(true)
    expect(state.focusMode).toBe(layout === 'ai-native')
  },
)

test.each(['ai-native', 'ide'] as const)(
  '%s preserves the previous layout when chat fails to load',
  async (layout) => {
    const calls: string[] = []
    await expect(
      showChatLayout(layout, {
        async executeCommand(id) {
          if (id === 'Layout.getSideBarFocusMode') return true
          if (id === 'Layout.getActiveSideBarView') return 'chat2.views.chat'
          calls.push(id)
          throw new Error('Chat could not load')
        },
        async setWorkbenchLayoutUrl() {},
        async toggleFocusMode() {
          calls.push('toggle')
        },
      }),
    ).rejects.toThrow('Chat could not load')
    expect(calls).toEqual(['SideBar.show'])
  },
)

test('switching from Boards to IDE restores Explorer without loading Chat', async () => {
  const calls: unknown[][] = []
  await showChatLayout('ide', {
    async executeCommand(id, ...args) {
      switch (id) {
        case 'Layout.getActiveSideBarView':
          return 'chat2.views.board'
        case 'Layout.getSideBarFocusMode':
          return true
        default:
          calls.push([id, ...args])
      }
      if (id === 'SideBar.show' && args[0] === 'chat2.views.chat') {
        throw new Error('Chat backend is unavailable')
      }
      return undefined
    },
    async setWorkbenchLayoutUrl(_execute, layout) {
      calls.push(['url', layout])
    },
    async toggleFocusMode() {
      calls.push(['toggle'])
    },
  })
  expect(calls).toEqual([
    ['url', 'ide'],
    ['SideBar.show', 'Explorer', true],
    ['Layout.leaveSideBarFocusMode'],
  ])
})
