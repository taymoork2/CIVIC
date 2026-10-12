import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Without a host, the canvas has no extension, as for any module project.
    alias: { 'virtual:civic-canvas-extension': fileURLToPath(new URL('./src/no-extension.ts', import.meta.url)) },
  },
})
