// CIVIC's review host for a Laundry checkout of its own (decision 0010). `bin/civic-laundry attach`
// copies this file into apps/web, and `bin/civic-laundry review` runs Vite with it. It starts from
// Laundry's own vite.config.ts, so the app's aliases, styles and React stay Laundry's, and changes
// only what review needs: no TanStack Start server or RSC (review mounts screens in CIVIC's frame),
// no hot reload, and CIVIC's review plugin with Laundry's connector.
import { fileURLToPath } from 'node:url'
import { defineConfig, type ConfigEnv, type PluginOption, type UserConfig } from 'vite'
import base from './vite.config.ts'
// @ts-expect-error The dev-only review middleware is a Node module, outside application types.
import { reviewPlugin } from './scripts/review-plugin.mjs'

const flatten = async (plugins: PluginOption[] = []): Promise<{ name?: string }[]> => {
  const out: { name?: string }[] = []
  for (const plugin of plugins) {
    const value = await plugin
    if (Array.isArray(value)) out.push(...(await flatten(value)))
    else if (value) out.push(value as { name?: string })
  }
  return out
}

// TanStack Start and RSC own the dev server's routing; review serves CIVIC's pages instead.
const appServer = (name = '') => /^(tanstack|@tanstack|rsc)/i.test(name) || name.startsWith('vite-plugin-rsc')

export default defineConfig(async (env: ConfigEnv): Promise<UserConfig> => {
  const config: UserConfig = typeof base === 'function' ? await base(env) : await base
  const review = await flatten([reviewPlugin()])
  const names = new Set(review.map((plugin) => plugin.name))
  // A Laundry branch from before the split may load an older review plugin of its own; CIVIC's replaces it.
  const plugins = (await flatten(config.plugins)).filter((plugin) => !appServer(plugin.name) && !names.has(plugin.name))
  return {
    ...config,
    server: { ...config.server, hmr: false },
    test: { ...config.test, alias: { ...(config.test?.alias as Record<string, string> | undefined), 'virtual:civic-canvas-extension': fileURLToPath(new URL('./src/review/canvas-extension.ts', import.meta.url)) } },
    plugins: [...review, ...plugins],
  }
})
