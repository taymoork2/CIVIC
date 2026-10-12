import { useQuery, useMutation } from 'convex/react'
import { ConvexHttpClient } from 'convex/browser'
import { useState } from 'react'
import { api } from '@/api'
import { convexUrl } from '@/convex-url'
import { Button } from '@/components/ui/button'
import { RecordList } from '@/kit/record-row'
import { ErrorNotice } from '@/kit/ui'

const deviceKey = 'washcloset:prefs:push-device'

function deviceId(): string {
  try {
    const stored = localStorage.getItem(deviceKey)
    if (stored) return stored
    const id = crypto.randomUUID()
    localStorage.setItem(deviceKey, id)
    return id
  } catch { return crypto.randomUUID() }
}

function applicationKey(key: string): Uint8Array<ArrayBuffer> {
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

/** Permission is requested only from the person's tap, including Home Screen Safari. */
export function PushSettings() {
  const [device] = useState(deviceId)
  const configuration = useQuery(api.notifications.pushConfiguration, {})
  const active = useQuery(api.notifications.deviceSubscription, { deviceId: device })
  const subscribe = useMutation(api.notifications.subscribe)
  const revoke = useMutation(api.notifications.revoke)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supported = typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const toggle = async () => {
    setPending(true)
    setError(null)
    try {
      if (active) {
        await revoke({ deviceId: device })
        const registration = await navigator.serviceWorker.getRegistration()
        await (await registration?.pushManager.getSubscription())?.unsubscribe()
        return
      }
      if (!configuration || !supported) return
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setError('Notifications weren’t allowed. You can change this in your device settings.'); return }
      if (!await navigator.serviceWorker.getRegistration()) await navigator.serviceWorker.register('/service-worker.js')
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(configuration.publicKey) })
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Subscription missing')
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json.endpoint))
      const endpointHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
      await subscribe({ deviceId: device, endpointHash, endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } })
    } catch { setError('Couldn’t change notifications. Check your connection and try again.') }
    finally { setPending(false) }
  }
  const fact = configuration === undefined ? 'Checking availability…' : configuration === null ? 'Closed-app alerts need server setup before they can be enabled.' : !supported ? 'Open the installed app over HTTPS. On iPhone, add it to your Home Screen first.' : active ? 'Enabled on this device. Delivery depends on your device and connection.' : 'Get a reminder when a laundry step is due, even after closing the app.'
  return <RecordList heading="Push notifications"><div className="grid gap-3 p-4">
    <p className="text-ink-2">{fact}</p>
    {configuration && supported ? <Button variant="outline" type="button" disabled={pending || active === undefined} onClick={() => void toggle()}>{pending ? 'Saving…' : active ? 'Turn off on this device' : 'Enable on this device'}</Button> : null}
    <ErrorNotice error={error} />
  </div></RecordList>
}

/** Clear this browser's subscription before signing out; other devices remain subscribed. */
export async function clearPushDevice(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    // WebKit push cleanup can remain pending when notifications have not been allowed.
    if ('Notification' in window && Notification.permission === 'granted') {
      const registration = await navigator.serviceWorker.getRegistration()
      await (await registration?.pushManager.getSubscription())?.unsubscribe()
    }
    const device = localStorage.getItem(deviceKey)
    if (!device) return
    const response = await fetch('/api/auth/convex/token', { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return
    const { token } = await response.json() as { token: string }
    const client = new ConvexHttpClient(convexUrl())
    client.setAuth(token)
    await client.mutation(api.notifications.revoke, { deviceId: device })
  } catch { /* Offline unsubscribe still ends delivery to this browser. */ }
}
