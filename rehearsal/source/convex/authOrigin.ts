/** The web proxy supplies these headers from its request URL, replacing caller values. */
export function authRequestOrigin(request: Request, siteUrl: string, trustedOrigins: readonly string[]): string {
  const host = request.headers.get('x-better-auth-forwarded-host')
  const protocol = request.headers.get('x-better-auth-forwarded-proto')
  if (host === null && protocol === null) return siteUrl
  if (!host || (protocol !== 'https' && protocol !== 'http')) throw new Error('Untrusted authentication origin')
  // Tailscale terminates TLS before the loopback web server. Its configured public hostname
  // always uses the authoritative HTTPS origin, even if the internal request URL says HTTP.
  if (siteUrl.startsWith('https://') && host === new URL(siteUrl).host) return siteUrl
  const origin = `${protocol}://${host}`
  if (![siteUrl, ...trustedOrigins].includes(origin)) throw new Error('Untrusted authentication origin')
  // HTTP is confined to explicitly configured loopback previews. Remote clients keep secure cookies.
  const hostname = new URL(origin).hostname
  if (protocol === 'http' && hostname !== 'localhost' && hostname !== '127.0.0.1') throw new Error('Untrusted authentication origin')
  return origin
}
