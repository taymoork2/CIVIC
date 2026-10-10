/** Push services are the only destinations allowed to receive a subscription request. */
export function validPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || value.length > 4096) return false
    return ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch { return false }
}

export function validPushKeys(keys: { p256dh: string; auth: string }): boolean {
  return /^[A-Za-z0-9_-]{87}=?$/.test(keys.p256dh) && /^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth)
}

/** A late timer prompt must not arrive hours after a laundry step has passed. */
export const pushLifetimeMs = 15 * 60_000
