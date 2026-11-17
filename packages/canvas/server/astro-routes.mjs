import { routeExports, isFunction, httpVerb, bracketPath, routeRow } from './file-routes.mjs'

export function astroOperations(code, file) {
  const match = /^src\/pages\/(?<path>.+)\.(?:ts|js)$/u.exec(file)
  if (!match) return []
  const path = bracketPath('/' + match[1].replace(/(?:^|\/)index$/u, ''))
  return routeExports(code, file).filter(([name, value]) => httpVerb.test(name) && isFunction(value)).map(([name]) => routeRow(name, path, file, name,
    'Conventional src/pages only: base, trailing slash, srcDir, output mode, prerender, generated paths and adapter deployment are not resolved; source declarations do not prove live endpoints.'))
}
export const astroDetector = { name: 'astro', detect: astroOperations }
