import { parseSync } from 'vite'
import { exportedFunctions } from './next-actions.mjs'

export function nextRouteOperations(code, file) {
  const parts = file.split('/'), app = parts.indexOf('app')
  if (app === -1 || !/^route\.(?:ts|js|mts|mjs|tsx|jsx)$/u.test(parts.at(-1))) return []
  const folders = parts.slice(app + 1, -1)
  if (folders.some(part => part.startsWith('@') || part.startsWith('_') || part.startsWith('(.)') || part.startsWith('(..)') || part.startsWith('(...)'))) return []
  // Catch-all suffixes retain one-or-more (+) versus optional zero-or-more (*).
  const path = '/' + folders.filter(part => !/^\(.*\)$/u.test(part)).map(part => part
    .replace(/^\[\[\.\.\.(?<optional>.+)\]\]$/u, ':$<optional>*')
    .replace(/^\[\.\.\.(?<rest>.+)\]$/u, ':$<rest>+')
    .replace(/^\[(?<parameter>.+)\]$/u, ':$<parameter>')).join('/')
  const parsed = parseSync(file, code)
  if (parsed.errors.length) throw Error(`Cannot inventory Next routes in ${file}`)
  return exportedFunctions(parsed.program.body).filter(([name, fn]) => /^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/u.test(name) && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(fn?.type)).map(([name]) => ({
    id: `${name} ${path}`, file, export: name, kind: 'route',
    limits: ['File convention only: next.config basePath, rewrites, custom extensions and re-exported handlers are not resolved.'],
  }))
}

export const nextRoutesDetector = { name: 'next-routes', detect: nextRouteOperations }
