export function localReviewOrigin(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.username && !url.password ? url.origin : null
  } catch { return null }
}

export async function trustedWindow(value, origin, fetcher) {
  const target = localReviewOrigin(value)
  if (!target) return false
  if (target === origin) return true
  const response = await fetcher(`${origin}/api/review/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'window-origins' }), credentials: 'include', signal: AbortSignal.timeout(5000) })
  return response.ok && (await response.json()).origins?.includes(target) === true
}
