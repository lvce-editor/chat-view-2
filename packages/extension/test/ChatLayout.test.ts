import { expect, test } from '@jest/globals'
import { showChatLayout } from '../src/parts/ChatLayout/ChatLayout.ts'

test.each(['ai-native', 'ide'] as const)(
  '%s keeps the board layout until chat loads',
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
  '%s preserves the board layout when chat fails to load',
  async (layout) => {
    const calls: string[] = []
    await expect(
      showChatLayout(layout, {
        async executeCommand(id) {
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
