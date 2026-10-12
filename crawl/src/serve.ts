import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }

/** Serves a folder of static files on loopback, for crawling an app that has no server of its own. */
export async function serveFolder(folder: string): Promise<{ url: string; close(): Promise<void> }> {
  const root = resolve(folder)
  const server: Server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname))
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path)
    if (request.method !== 'GET' || !file.startsWith(root)) {
      response.writeHead(405).end()
      return
    }
    try {
      const body = await readFile(file)
      response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The static server has no port.')
  return { url: `http://127.0.0.1:${address.port}/`, close: () => new Promise((done) => server.close(() => done())) }
}
