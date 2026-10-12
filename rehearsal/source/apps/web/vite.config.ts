/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import rsc from '@vitejs/plugin-rsc'
import { defineConfig } from 'vite'
// @ts-expect-error The dev-only review middleware is a Node module, outside application types.
import { reviewPlugin } from './scripts/review-plugin.mjs'

const buildId = process.env.WASHCLOSET_BUILD_ID ?? new Date().toISOString()
const review = process.env.WASHCLOSET_REVIEW === '1'

export default defineConfig({
  cacheDir: process.env.REHEARSAL_VITE_CACHE ?? '.vite',
  define: {
    // Versions the cache and push service worker together so each build installs as an update.
    __WASHCLOSET_BUILD__: JSON.stringify(buildId),
  },
  // Phones reach this Mac privately through Tailscale (scripts/serve-local.sh), under a *.ts.net name.
  server: { allowedHosts: ['.ts.net'], ...(process.env.WASHCLOSET_REVIEW === '1' ? { hmr: false } : {}) },
  preview: { allowedHosts: ['.ts.net'] },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@convex': fileURLToPath(new URL('../../convex', import.meta.url)),
      '@washcloset/icons': fileURLToPath(new URL('../../packages/icons/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // Browser journeys live in e2e/ and run under Playwright, not Vitest.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    setupFiles: ['src/test/setup.ts'],
  },
  plugins: [
    ...(process.env.WASHCLOSET_REVIEW === '1' ? [reviewPlugin()] : []),
    {
      name: 'washcloset-offline-assets',
      generateBundle(_options, bundle) {
        if (this.environment.name !== 'client') return
        this.emitFile({ type: 'asset', fileName: 'app-version.json', source: JSON.stringify({ build: buildId }) })
        // Include lazy route dependencies: the signed-out shell cannot name every
        // module needed to hydrate a saved authenticated checklist offline.
        const paths = Object.keys(bundle).filter((path) => /^assets\/[^?#]+\.(?:js|css|woff2)$/.test(path)).sort().map((path) => `/${path}`)
        this.emitFile({ type: 'asset', fileName: 'offline-assets.json', source: JSON.stringify(paths) })
      },
    },
    tailwindcss(),
    ...(review ? [] : [tanstackStart({
      rsc: { enabled: true },
    }), rsc()]),
    react(),
  ],
})
