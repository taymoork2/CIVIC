import { parseSync } from 'vite'
import { exportedFunctions } from './next-actions.mjs'

export const httpVerb = /^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|ALL)$/u
export const isFunction = node => ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node?.type)
export function routeExports(code, file) {
  const parsed = parseSync(file, code)
  if (parsed.errors.length) throw Error(`Cannot inventory routes in ${file}`)
  return exportedFunctions(parsed.program.body)
}
export const bracketPath = path => path.replaceAll(/\[\[(?<optional>[\w]+)\]\]/gu, ':$<optional>?').replaceAll(/\[\.\.\.(?<rest>[\w]+)\]/gu, ':$<rest>*').replaceAll(/\[(?<param>[\w]+)\]/gu, ':$<param>')
export const routeRow = (method, path, file, name, limit) => ({ id: method + ' ' + path, file, export: name, kind: 'route', limits: [limit] })
