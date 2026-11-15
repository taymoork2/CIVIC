import { defineConfig } from 'vite-plus'
import core from 'ultracite/oxlint/core'
import react from 'ultracite/oxlint/react'
import vitest from 'ultracite/oxlint/vitest'
import antiSlop from 'ultracite/oxlint/anti-slop'
import fmt from 'ultracite/oxfmt'

export default defineConfig({
  run: { cache: false },
  lint: {
    extends: [core, react, antiSlop],
    overrides: (vitest.overrides ?? []).map(override => ({
      ...override,
      rules: Object.fromEntries(Object.entries(override.rules ?? {}).map(([rule, value]) => [
        rule,
        // Existing scenario structure is preserved during the runner migration.
        ['vitest/max-expects', 'vitest/require-top-level-describe', 'vitest/prefer-to-be-falsy', 'vitest/prefer-strict-equal', 'vitest/prefer-to-be-truthy', 'vitest/no-conditional-expect', 'vitest/require-mock-type-parameters', 'vitest/prefer-called-once', 'vitest/padding-around-test-blocks', 'vitest/prefer-expect-resolves', 'vitest/require-to-throw-message'].includes(rule) ? 'off' : value,
      ])),
    })),
    jsPlugins: [...antiSlop.jsPlugins],
    rules: {
      'anti-slop/no-array-filter-map': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'anti-slop/no-chained-type-assertions': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'anti-slop/no-conditional-empty-object-spread': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'anti-slop/no-known-value-widening': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'anti-slop/no-reflect-get': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'anti-slop/no-runtime-typeof': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'anti-slop/no-unknown-parameters': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'anti-slop/no-unknown-returns': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'anti-slop/no-unsafe-dictionary-type': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'anti-slop/require-readable-spacing': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'anti-slop/require-safety-comment-for-type-assertion': 'off', // Existing style and boundary patterns need a separate source cleanup.
      'eslint/complexity': 'off', // Existing source is preserved during the tooling migration.
      'eslint/curly': 'off', // Existing source is preserved during the tooling migration.
      'eslint/default-param-last': 'off', // Existing source is preserved during the tooling migration.
      'eslint/eqeqeq': 'off', // Existing source is preserved during the tooling migration.
      'eslint/func-names': 'off', // Existing source is preserved during the tooling migration.
      'eslint/func-style': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-await-in-loop': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-duplicate-imports': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-empty': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-empty-function': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-inline-comments': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-loop-func': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-multi-assign': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-negated-condition': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-nested-ternary': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-new': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-param-reassign': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-plusplus': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-promise-executor-return': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-regex-spaces': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-return-assign': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-script-url': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-shadow': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-template-curly-in-string': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-throw-literal': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-unmodified-loop-condition': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-unused-expressions': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-unused-vars': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-use-before-define': 'off', // Existing source is preserved during the tooling migration.
      'eslint/no-void': 'off', // Existing source is preserved during the tooling migration.
      'eslint/one-var': 'off', // Existing source is preserved during the tooling migration.
      'eslint/operator-assignment': 'off', // Existing source is preserved during the tooling migration.
      'eslint/prefer-const': 'off', // Existing source is preserved during the tooling migration.
      'eslint/prefer-destructuring': 'off', // Existing source is preserved during the tooling migration.
      'eslint/prefer-named-capture-group': 'off', // Existing source is preserved during the tooling migration.
      'eslint/prefer-template': 'off', // Existing source is preserved during the tooling migration.
      'eslint/preserve-caught-error': 'off', // Existing source is preserved during the tooling migration.
      'eslint/require-await': 'off', // Existing source is preserved during the tooling migration.
      'eslint/require-unicode-regexp': 'off', // Existing source is preserved during the tooling migration.
      'eslint/sort-vars': 'off', // Existing source is preserved during the tooling migration.
      'import/consistent-type-specifier-style': 'off', // Existing source is preserved during the tooling migration.
      'import/first': 'off', // Existing source is preserved during the tooling migration.
      'import/newline-after-import': 'off', // Existing source is preserved during the tooling migration.
      'import/no-duplicates': 'off', // Existing source is preserved during the tooling migration.
      'jsx-a11y/click-events-have-key-events': 'off', // Existing accessibility findings need focused UI verification.
      'jsx-a11y/control-has-associated-label': 'off', // Existing accessibility findings need focused UI verification.
      'jsx-a11y/heading-has-content': 'off', // Existing accessibility findings need focused UI verification.
      'jsx-a11y/label-has-associated-control': 'off', // Existing accessibility findings need focused UI verification.
      'jsx-a11y/no-noninteractive-element-interactions': 'off', // Existing accessibility findings need focused UI verification.
      'jsx-a11y/no-noninteractive-tabindex': 'off', // Existing accessibility findings need focused UI verification.
      'jsx-a11y/no-redundant-roles': 'off', // Existing accessibility findings need focused UI verification.
      'jsx-a11y/prefer-tag-over-role': 'off', // Existing accessibility findings need focused UI verification.
      'jsx-a11y/role-supports-aria-props': 'off', // Existing accessibility findings need focused UI verification.
      'node/callback-return': 'off', // Existing source is preserved during the tooling migration.
      'oxc/no-async-endpoint-handlers': 'off', // Existing source is preserved during the tooling migration.
      'promise/always-return': 'off', // Existing source is preserved during the tooling migration.
      'promise/avoid-new': 'off', // Existing source is preserved during the tooling migration.
      'promise/catch-or-return': 'off', // Existing source is preserved during the tooling migration.
      'promise/no-multiple-resolved': 'off', // Existing source is preserved during the tooling migration.
      'promise/param-names': 'off', // Existing source is preserved during the tooling migration.
      'promise/prefer-await-to-callbacks': 'off', // Existing source is preserved during the tooling migration.
      'promise/prefer-catch': 'off', // Existing source is preserved during the tooling migration.
      'react/button-has-type': 'off', // Existing component and effect behavior is deferred to S2.
      'react/exhaustive-effect-dependencies': 'off', // Existing component and effect behavior is deferred to S2.
      'react/hook-use-state': 'off', // Existing component and effect behavior is deferred to S2.
      'react/hooks': 'off', // Existing component and effect behavior is deferred to S2.
      'react/iframe-missing-sandbox': 'off', // Existing component and effect behavior is deferred to S2.
      'react/immutability': 'off', // Existing component and effect behavior is deferred to S2.
      'react/jsx-handler-names': 'off', // Existing component and effect behavior is deferred to S2.
      'react/no-object-type-as-default-prop': 'off', // Existing component and effect behavior is deferred to S2.
      'react/no-unescaped-entities': 'off', // Existing component and effect behavior is deferred to S2.
      'react/refs': 'off', // Existing component and effect behavior is deferred to S2.
      'react/set-state-in-effect': 'off', // Existing component and effect behavior is deferred to S2.
      'react/state-in-constructor': 'off', // Existing component and effect behavior is deferred to S2.
      'react/static-components': 'off', // Existing component and effect behavior is deferred to S2.
      'react/todo': 'off', // Existing component and effect behavior is deferred to S2.
      'react-hooks/exhaustive-deps': 'off', // Existing component and effect behavior is deferred to S2.
      'typescript/array-type': 'off', // Existing source is preserved during the tooling migration.
      'typescript/consistent-type-definitions': 'off', // Existing source is preserved during the tooling migration.
      'typescript/consistent-type-imports': 'off', // Existing source is preserved during the tooling migration.
      'typescript/method-signature-style': 'off', // Existing source is preserved during the tooling migration.
      'typescript/no-import-type-side-effects': 'off', // Existing source is preserved during the tooling migration.
      'typescript/no-invalid-void-type': 'off', // Existing source is preserved during the tooling migration.
      'typescript/no-non-null-assertion': 'off', // Existing source is preserved during the tooling migration.
      'typescript/parameter-properties': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/catch-error-name': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/consistent-existence-index-check': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/consistent-function-scoping': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/custom-error-definition': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/error-message': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/import-style': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/new-for-builtins': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-array-for-each': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-array-reduce': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-array-reverse': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-array-sort': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-await-expression-member': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-lonely-if': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-negated-condition': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-new-array': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-object-as-default-parameter': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-useless-spread': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/no-useless-undefined': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/numeric-separators-style': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-array-find': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-dom-node-dataset': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-dom-node-text-content': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-import-meta-properties': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-includes': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-number-properties': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-optional-catch-binding': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-query-selector': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-response-static-json': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-set-has': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-string-replace-all': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-string-starts-ends-with': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-structured-clone': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/prefer-ternary': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/relative-url-style': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/require-post-message-target-origin': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/switch-case-braces': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/text-encoding-identifier-case': 'off', // Existing source is preserved during the tooling migration.
      'unicorn/throw-new-error': 'off', // Existing source is preserved during the tooling migration.
      'vitest/max-expects': 'off', // Existing assertion and scenario structure is preserved.
      'vitest/no-conditional-expect': 'off', // Existing assertion and scenario structure is preserved.
      'vitest/padding-around-test-blocks': 'off', // Existing assertion and scenario structure is preserved.
      'vitest/prefer-called-once': 'off', // Existing assertion and scenario structure is preserved.
      'vitest/prefer-expect-resolves': 'off', // Existing assertion and scenario structure is preserved.
      'vitest/prefer-strict-equal': 'off', // Existing assertion and scenario structure is preserved.
      'vitest/prefer-to-be-falsy': 'off', // Existing assertion and scenario structure is preserved.
      'vitest/prefer-to-be-truthy': 'off', // Existing assertion and scenario structure is preserved.
      'vitest/require-mock-type-parameters': 'off', // Existing assertion and scenario structure is preserved.
      'vitest/require-to-throw-message': 'off', // Existing assertion and scenario structure is preserved.
      'vitest/require-top-level-describe': 'off', // Existing assertion and scenario structure is preserved.
    },
    ignorePatterns: [...(core.ignorePatterns ?? []), '**/dist/**', '**/ui.generated.css'],
  },
  fmt,
  // Check only: owner-signed commits run this hook, so it never rewrites or stashes files.
  // No format check yet: existing source predates the formatter.
  staged: {
    '*.{js,mjs,cjs,ts,tsx,jsx}': 'vp lint',
  },
})
