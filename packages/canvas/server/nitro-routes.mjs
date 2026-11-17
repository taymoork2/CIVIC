import { routeExports, routeRow, isFunction } from './file-routes.mjs'

const isHandler = node => isFunction(node) || node?.type === 'CallExpression' && node.callee.type === 'Identifier' && ['defineEventHandler', 'defineLazyEventHandler', 'defineHandler', 'eventHandler'].includes(node.callee.name)

export function nitroOperations(code, file) {
  const match = /^server\/(?<root>api|routes)\/(?<path>.+)\.(?:ts|js)$/u.exec(file)
  if (!match) return []
  const handler = routeExports(code, file).find(([name]) => name === 'default')
  if (!isHandler(handler?.[1])) return []
  const method = /\.(?<method>get|head|post|put|patch|delete|options)$/u.exec(match[2])
  const stem = method ? match[2].slice(0, -method[0].length) : match[2]
  const path = ('/' + (match[1] === 'api' ? 'api/' : '') + stem).replace(/\/index$/u, '').replaceAll(/\[\.\.\.(?<rest>[\w]+)\]/gu, ':$<rest>+').replaceAll(/\[(?<param>[\w]+)\]/gu, ':$<param>') || '/'
  return [routeRow(method ? method[1].toUpperCase() : 'ALL', path, file, 'default',
    'Conventional Nuxt server/api and server/routes only: base, trailing slash, srcDir, layers, custom serverDir/scanDirs and programmatic Nitro handlers are not resolved.')]
}
export const nitroDetector = { name: 'nitro', detect: nitroOperations }
