import { literalRouteOperations } from './literal-routes.mjs'

export const honoOperations = (code, file) => literalRouteOperations(code, file, 'hono', 'Hono app.routes')
export const honoDetector = { name: 'hono', detect: honoOperations }
