import type { TestApi } from '@lvce-editor/test-with-playwright'

type Command = TestApi['Command']

export const showChat2 = async (Command: Command): Promise<void> => {
  await Command.executeExtensionCommand('chat2.show')
}
