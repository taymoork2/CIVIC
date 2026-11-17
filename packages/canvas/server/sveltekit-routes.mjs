import { routeExports, isFunction, httpVerb, bracketPath, routeRow } from './file-routes.mjs'

const limit = 'Conventional src/routes only: configured routes dirs, basePath, base, trailing slash, matchers and re-exports are not resolved.'
export function sveltekitOperations(code, file) {
  const match = /^src\/routes\/(?<path>(?:.*\/)?)(?<module>\+server|\+page\.server)\.(?:ts|js)$/u.exec(file)
  if (!match) return []
  const path = bracketPath('/' + match[1].split('/').filter(part => part && !/^\(.*\)$/u.test(part)).join('/'))
  const rows = []
  for (const [name, value] of routeExports(code, file)) {
    if (match[2] === '+server' && isFunction(value) && (httpVerb.test(name) && name !== 'ALL' || name === 'fallback')) rows.push(routeRow(name === 'fallback' ? 'ALL' : name, path, file, name, limit))
    if (match[2] !== '+page.server') continue
    const rpc = action => ({ id: file + ':' + action, file, export: action, kind: 'rpc', limits: [limit, 'Replay requires route load/action identity; POST pathname alone cannot distinguish named actions.'] })
    if (name === 'load' && isFunction(value)) rows.push(rpc(name))
    if (name === 'actions' && value?.type === 'ObjectExpression') {
      for (const property of value.properties) {
        if (property.type === 'Property' && !property.computed && isFunction(property.value)) rows.push(rpc('actions.' + (property.key.name ?? property.key.value)))
      }
    }
  }
  return rows
}
export const sveltekitDetector = { name: 'sveltekit', detect: sveltekitOperations }
