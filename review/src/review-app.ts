import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { git, revisionOf, type Checkout } from './git.ts'
import { lineIdFor, registerPreview, unregisterPreview, type Context } from './loop.ts'
import { createOverlayServer, type Rasterize } from './overlay/server.ts'
import { createInjectingProxy } from './overlay/proxy.ts'

export interface ReviewApp {
  /** Where a reviewer opens the app: the proxy, which serves the app with the overlay in it. */
  origin: string
  /** The overlay server that turns each selection into an annotation. */
  overlay: string
  line: string
  revision: string
  close(): Promise<void>
}

export interface ReviewAppInput {
  /** The running app, on loopback. It is only read from; its source is never changed. */
  upstream: string
  /** Files the annotations under this branch when the app runs from a detached copy of its head. */
  branch?: string
  port?: number
  overlayPort?: number
  rasterize?: Rasterize
}

const listen = async (server: Server, port = 0) => {
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/**
 * Serves a running app for review (decision 0019): a loopback proxy puts the capture overlay
 * into its pages, and the checkout it runs from is registered as that preview, so an annotation
 * made on it lands on that line at that revision (D36). Records go to the checkout's git common
 * directory (D39); nothing is committed. A checkout with uncommitted changes is refused, since
 * its revision would not describe what is on screen.
 */
export async function startReviewApp(context: Context, input: ReviewAppInput): Promise<ReviewApp> {
  const { checkout } = context
  if (git(checkout.root, 'status', '--porcelain') !== '') throw new Error(`${checkout.root} has uncommitted changes, so its revision would not describe what is on screen.`)
  const named: Checkout = input.branch ? { ...checkout, branch: input.branch } : checkout
  if (input.branch && revisionOf(checkout.root, input.branch) !== checkout.head) throw new Error(`${checkout.root} is not at the head of ${input.branch}, so annotations would not be on that branch's revision.`)
  const scoped: Context = { ...context, checkout: named }
  const line = lineIdFor(named)

  const overlayServer = createOverlayServer(() => scoped, input.rasterize)
  const overlay = await listen(overlayServer, input.overlayPort)
  const tag = `<script src="${overlay}/overlay.js" data-civic-line="${line}" data-civic-revision="${named.head}" defer></script>`
  let proxy: Server
  let origin: string
  try {
    proxy = createInjectingProxy(input.upstream, tag)
    origin = await listen(proxy, input.port)
  } catch (error) {
    overlayServer.close()
    throw error
  }
  registerPreview(scoped, origin)
  return {
    origin,
    overlay,
    line,
    revision: named.head,
    close: async () => {
      unregisterPreview(scoped, origin)
      for (const server of [proxy, overlayServer]) {
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    },
  }
}
