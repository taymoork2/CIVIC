const authPaths = new Set(['/sign-in', '/create-account', '/forgot-password'])
const redirectBase = 'https://redirect.invalid'

/**
 * A same-site path to return to after signing in; anything else (another origin, a scheme) is
 * dropped. An auth page is never a destination: a redirect that points at one (a guard that
 * captured /sign-in?redirect=… mid-navigation) unwraps to the innermost real target, if any.
 */
export function safeRedirect(value: unknown): string | undefined {
  let current = value
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'string' || !current.startsWith('/') || current.startsWith('//') || current.includes('\\')) return undefined
    let url: URL
    try { url = new URL(current, redirectBase) } catch { return undefined }
    // Whitespace the parser strips can still turn a path into another host.
    if (url.origin !== redirectBase) return undefined
    let path: string
    try { path = decodeURIComponent(url.pathname).toLowerCase().replace(/\/+$/, '') } catch { return undefined }
    if (!authPaths.has(path)) return current
    current = url.searchParams.get('redirect') ?? undefined
  }
  return undefined
}
