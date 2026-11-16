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
    overrides: [...(vitest.overrides ?? []),
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
