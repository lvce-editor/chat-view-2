import * as config from '@lvce-editor/eslint-config'
import * as actions from '@lvce-editor/eslint-plugin-github-actions'

export default [
  ...config.default,
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
]
