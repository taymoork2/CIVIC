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
    // House style for tests: top-level tests and the matchers CIVIC uses.
    overrides: [...(vitest.overrides ?? []).map(override => ({ ...override, rules: { ...override.rules, ...Object.fromEntries(['vitest/require-top-level-describe', 'vitest/prefer-strict-equal', 'vitest/prefer-to-be-truthy', 'vitest/prefer-to-be-falsy'].map(rule => [rule, 'off'])) } })),
      { files: ["canvas/src/**/*", "shell/src/**/*"], rules: {
        "no-restricted-imports": ["error", { paths: [{ name: "react", importNames: ["useEffect"], message: "Use a named external-sync hook." }] }],
      } },
      { files: ["**/server/**/*", "local/**/*"], rules: {
        "no-restricted-globals": ["error", "setTimeout", "setInterval"],
      } },
    ],
    jsPlugins: [...antiSlop.jsPlugins],
    rules: {
      'no-restricted-properties': ['error', ...['vi', 'vitest', 'jest'].flatMap(object =>
        ['mock', 'doMock', 'unstable_mockModule'].map(property => ({ object, property, message: 'Use real dependencies.' })))],
      // Style rules whose opposite is CIVIC's house style; new code reads like its neighbours.
      ...Object.fromEntries([
        'anti-slop/require-readable-spacing', 'eslint/curly', 'eslint/func-style', 'eslint/func-names',
        'eslint/one-var', 'eslint/sort-vars', 'eslint/no-plusplus', 'eslint/prefer-destructuring',
        'eslint/prefer-template', 'eslint/no-nested-ternary', 'unicorn/new-for-builtins', 'unicorn/throw-new-error',
        'unicorn/text-encoding-identifier-case', 'unicorn/numeric-separators-style',
        'typescript/consistent-type-definitions', 'import/consistent-type-specifier-style',
      ].map(rule => [rule, 'off'])),
    },
    ignorePatterns: [...(core.ignorePatterns ?? []), '**/dist/**', '**/ui.generated.css'],
  },
  fmt,
  // Check only: owner-signed commits run this hook, so it never rewrites or stashes files.
  // No format check yet: existing source predates the formatter. Plain `vp lint` would fail on
  // any file with baselined findings, so the hook runs the baseline check once instead.
  staged: {
    '*.{js,mjs,cjs,ts,tsx,jsx}': () => 'node ../bin/lint-baseline.mjs',
  },
})
