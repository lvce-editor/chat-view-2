import * as config from '@lvce-editor/eslint-config'
import * as actions from '@lvce-editor/eslint-plugin-github-actions'

export default [
  ...config.default,
  ...config.recommendedVirtualDom,
  ...config.recommendedRegex,
  ...config.recommendedTsconfig,
  ...actions.default,
  {
    rules: {
      'github-actions/ci-versions': 'off',
      'github-actions/action-versions': 'off',
      'sonarjs/void-use': 'off',
    },
  },
  {
    files: ['**/test/**/*.ts'],
    rules: {
      'virtual-dom/no-object-attribute-values': 'off',
      'virtual-dom/prefer-merge-class-names': 'off',
      'virtual-dom/prefer-state-destructuring': 'off',
    },
  },
  {
    files: [
      'packages/extension/src/parts/AgentChatApi/AgentChatApi.ts',
      'packages/extension/src/parts/ComputerUseToolHost/ComputerUseToolHost.ts',
      'packages/extension/src/parts/MockChatApi/MockChatApi.ts',
      'packages/node/src/computerUseClient.js',
    ],
    rules: {
      'virtual-dom/no-object-attribute-values': 'off',
    },
  },
  {
    files: [
      'packages/extension/src/parts/ChatFocusMode/ChatFocusMode.ts',
      'packages/extension/src/parts/ChatView/CreateInstance.ts',
      'packages/extension/src/parts/Main/Main.ts',
    ],
    rules: {
      'virtual-dom/prefer-state-destructuring': 'off',
    },
  },
]
