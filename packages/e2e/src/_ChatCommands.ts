import type {
  ILocator,
  ILocatorExternal,
  TestApi,
} from '@lvce-editor/test-with-playwright'

type Command = TestApi['Command']

const getChatViewUid = async (Command: Command): Promise<number> => {
  const components: Awaited<
    ReturnType<TestApi['ComponentState']['getComponents']>
  > = await Command.execute('ComponentState.getComponents')
  // Chat 2 is the only extension loaded by this browser suite. Its view title
  // changes with the selected conversation, so identify it by module instead.
  const chat = components.find(
    (component) => component.moduleId === 'ExtensionView',
  )
  if (!chat) {
    throw new Error('Expected Chat 2 to be open')
  }
  return chat.uid
}

export const runChatViewCommand = async (
  Command: Command,
  command: string,
  ...args: readonly unknown[]
): Promise<void> => {
  const uid = await getChatViewUid(Command)
  await Command.execute('Viewlet.executeViewletCommand', uid, command, ...args)
}

const getControlName = async (
  Command: Command,
  locator: ILocatorExternal,
): Promise<string> => {
  const { actual } = await Command.execute(
    'TestFrameWork.checkConditionError',
    'toHaveAttribute',
    (locator as ILocator)._parsed,
    { key: 'name' },
  )
  if (typeof actual !== 'string' || !actual) {
    throw new Error('Expected a named Chat 2 control')
  }
  return actual
}

export const runChatAction = async (
  Command: Command,
  action: string | ILocatorExternal,
): Promise<void> => {
  const name =
    typeof action === 'string' ? action : await getControlName(Command, action)
  await runChatViewCommand(Command, 'handleClick', name)
}

export const openChatTask = async (
  Command: Command,
  task: ILocatorExternal,
): Promise<void> => {
  const name = await getControlName(Command, task)
  await runChatViewCommand(
    Command,
    'handleViewCommand',
    'handleTaskClick',
    name,
    0,
    1,
  )
}

export const scrollChatContentIntoView = async (
  Command: Command,
  selector: string,
): Promise<void> => {
  const uid = await getChatViewUid(Command)
  await Command.execute(
    'WebView.compatRendererProcessInvoke',
    'Viewlet.scrollSelectorIntoView',
    uid,
    selector,
  )
}
