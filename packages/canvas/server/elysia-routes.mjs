import { literalRouteOperations } from './literal-routes.mjs'

export const elysiaOperations = (code, file) => literalRouteOperations(code, file, 'elysia', 'Elysia routes')
export const elysiaDetector = { name: 'elysia', detect: elysiaOperations }
