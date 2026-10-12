const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The Convex address for this page. A build configured for a loopback backend still works from
 * another device (a phone over the private network): it then uses the page's own host on the
 * port that forwards to the backend.
 */
export function resolveConvexUrl(configured: string, page: { protocol: string; hostname: string }, remotePort: string): string {
  const target = new URL(configured)
  if (!loopback.has(target.hostname) || loopback.has(page.hostname)) return configured.replace(/\/$/, '')
  target.protocol = page.protocol
  target.hostname = page.hostname
  target.port = remotePort
  return target.href.replace(/\/$/, '')
}

export function convexUrl(): string {
  const configured = import.meta.env.VITE_CONVEX_URL as string | undefined
  if (configured === undefined || configured.length === 0) throw new Error('VITE_CONVEX_URL is not configured')
  if (typeof window === 'undefined') return configured.replace(/\/$/, '')
  return resolveConvexUrl(configured, window.location, (import.meta.env.VITE_CONVEX_REMOTE_PORT as string | undefined) ?? '8443')
}
