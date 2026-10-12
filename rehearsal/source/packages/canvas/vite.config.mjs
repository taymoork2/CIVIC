import { defineConfig } from 'vite'
import { canvasPlugins } from './server/canvas-host.mjs'

// The standalone canvas (`civic-canvas`): settings arrive through CIVIC_STORE and CIVIC_PROJECT.
export default defineConfig({ plugins: canvasPlugins() })
