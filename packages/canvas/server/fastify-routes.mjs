import { literalRouteOperations } from './literal-routes.mjs'

export const fastifyOperations = (code, file) => literalRouteOperations(code, file, 'fastify', 'Fastify onRoute')
export const fastifyDetector = { name: 'fastify', detect: fastifyOperations }
