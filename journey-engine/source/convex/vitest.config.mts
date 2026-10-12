import { defineConfig } from 'vitest/config'

// convex-test runs Convex functions in the edge runtime against the real schema.
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
  },
})
