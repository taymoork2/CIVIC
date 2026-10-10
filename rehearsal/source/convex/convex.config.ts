import betterAuth from '@convex-dev/better-auth/convex.config'
import { defineApp } from 'convex/server'

// Push delivery uses Web Crypto in Convex's default runtime; no Node action runtime is required.

const app = defineApp()
app.use(betterAuth)

export default app
