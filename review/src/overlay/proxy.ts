import { createServer, request, type IncomingMessage, type OutgoingHttpHeaders, type Server } from 'node:http'
import { connect } from 'node:net'

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/
const MAX_HTML = 20_000_000

/**
 * A loopback proxy in front of a running app that puts the capture overlay's script tag into
 * the HTML it serves (D40, decision 0019). The app's source is never touched: the page, its
 * assets and its WebSockets (an engine socket, a dev server's hot reload) pass through as they
 * are. Only loopback callers are served, and only a loopback app is proxied.
 */
export function createInjectingProxy(upstream: string, tag: string): Server {
  const target = new URL(upstream)
  if (target.protocol !== 'http:' || !LOOPBACK_HOST.test(target.host)) throw new Error(`Only a loopback http app can be proxied. Got ${upstream}.`)
  const refused = (req: IncomingMessage) => !LOOPBACK_HOST.test(req.headers.host ?? '')

  const server = createServer((req, res) => {
    if (refused(req)) return void res.writeHead(403).end('The CIVIC review proxy is local only.')
    // Identity encoding keeps the HTML readable; the app's other headers and the body pass through.
    const forward = request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host, 'accept-encoding': 'identity' } }, (reply) => {
      if (!/^text\/html\b/i.test(reply.headers['content-type'] ?? '')) {
        res.writeHead(reply.statusCode ?? 502, reply.headers)
        return void reply.pipe(res)
      }
      const chunks: Buffer[] = []
      let size = 0
      reply.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_HTML) return void reply.destroy(new Error('The page is too large to inject into.'))
        chunks.push(chunk)
      })
      reply.on('error', () => res.headersSent || res.writeHead(502).end())
      reply.on('end', () => {
        const html = inject(Buffer.concat(chunks).toString('utf8'), tag)
        // The injected page differs from the app's own, so its validators and length no longer apply.
        const { etag: _etag, 'last-modified': _modified, 'content-length': _length, ...headers } = reply.headers as OutgoingHttpHeaders
        res.writeHead(reply.statusCode ?? 502, { ...headers, 'cache-control': 'no-store' }).end(html)
      })
    })
    forward.on('error', () => res.headersSent || res.writeHead(502, { 'content-type': 'text/plain' }).end(`The app at ${upstream} is not answering.`))
    req.pipe(forward)
  })

  // WebSockets are tunnelled byte for byte, so the app's own origin checks still see the caller's Origin.
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy())
    if (refused(req)) return void socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    const peer = connect(Number(target.port), target.hostname, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`]
      for (let index = 0; index < req.rawHeaders.length; index += 2) lines.push(`${req.rawHeaders[index]}: ${/^host$/i.test(req.rawHeaders[index]!) ? target.host : req.rawHeaders[index + 1]}`)
      peer.write(`${lines.join('\r\n')}\r\n\r\n`)
      if (head.length) peer.write(head)
      socket.pipe(peer).pipe(socket)
    })
    const close = () => { socket.destroy(); peer.destroy() }
    for (const end of [socket, peer]) end.on('error', close).on('close', close)
  })
  return server
}

/** Before `</head>`; the overlay script is deferred, so it still runs after the page is parsed. */
export function inject(html: string, tag: string): string {
  const at = html.search(/<\/head\s*>/i)
  return at === -1 ? `${html}${tag}` : `${html.slice(0, at)}${tag}${html.slice(at)}`
}
