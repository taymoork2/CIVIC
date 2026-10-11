// Serves the built Storybook (storybook-static/) for the Playwright run. Storybook's preview
// loads ES modules, which browsers refuse from file:// URLs, so it needs a local server.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = new URL('storybook-static/', import.meta.url).pathname
const port = Number(process.env.PORT ?? 6106)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

if (!existsSync(join(root, 'index.json'))) throw new Error('No storybook-static/ build; run pnpm run storybook:build first.')
createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(root, path)
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!file.startsWith(root) || !existsSync(file)) {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(response)
}).listen(port, '127.0.0.1', () => console.log(`Storybook on http://127.0.0.1:${port}`))
