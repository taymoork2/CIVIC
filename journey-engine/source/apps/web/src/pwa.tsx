import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { useConvex } from 'convex/react'
import { pwaText } from './copy'
import { watchAppUpdates } from './app-updates'

const updateBannerClassName = cn(
  "update-banner",
  "fixed grid gap-2 max-w-[30rem] mx-auto p-[var(--space-3)_var(--space-4)] rounded-label",
  "[inset-inline:var(--space-3)]",
  "[inset-block-end:calc(var(--bar-bottom)_+_var(--bar-h)_+_var(--space-3))]",
  "[z-index:25]",
  "[background:var(--label)]",
  "[border:var(--rule-width)_solid_var(--line)]",
)

const secondaryButtonClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  "[&.danger]:text-destructive",
)

const labelCardClassName = cn(
  "label-card",
  "bg-surface rounded-card overflow-hidden",
  "[.household-page_>_&]:overflow-hidden [.household-page_>_&]:rounded-[1.25rem] [.household-page_>_&]:bg-transparent [.household-page_>_&]:border-0 [.household-page_>_&]:shadow-none",
  "[.household-page_>_&_h2]:font-text [.household-page_>_&_h2]:font-semibold [.household-page_>_&_h2]:leading-[1.3]",
  "[.household-page_>_&_h2]:text-[length:var(--step-2)]",
  "[.settings-page_&_h2]:font-text [.settings-page_&_h2]:font-semibold [.settings-page_&_h2]:leading-[1.3]",
  "[.settings-page_&_h2]:text-[length:var(--step-2)]",
  "[.settings-page_&]:border-0 [.settings-page_&]:shadow-[var(--shadow-sm)] [.settings-page_&]:rounded-[1.25rem]",
)

const paddedClassName = cn(
  "padded",
  "[.label-card&]:p-4 [.label-card&]:grid [.label-card&]:gap-3",
  "[.settings-page_.label-card&]:gap-4",
)

const mutedClassName = cn(
  "muted",
  "text-ink-2",
)

declare const __WASHCLOSET_BUILD__: string

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferredInstall: InstallPromptEvent | null = null
const installListeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredInstall = event as InstallPromptEvent
    installListeners.forEach((listener) => listener())
  })
}

/** Updates clear root screens automatically; a working draft or task defers the refresh. */
export function PwaUpdates() {
  const client = useConvex()
  const [waiting, setWaiting] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const stop = watchAppUpdates(__WASHCLOSET_BUILD__, client, () => setWaiting(true))
    // Code fetched before the worker was in control is never cached on its own: report it once ready.
    if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then((registration) => {
      const urls = performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.startsWith(`${window.location.origin}/assets/`))
      registration.active?.postMessage({ type: 'CACHE_ASSETS', urls })
    }).catch(() => undefined)
    return stop
  }, [client])

  if (!waiting || dismissed) return null
  return (
    <div className={updateBannerClassName} role="status">
      <p>{pwaText.updateReady}</p>
      <Button variant="unstyled" size="unstyled" className={secondaryButtonClassName} type="button" onClick={() => setDismissed(true)}>{pwaText.later}</Button>
    </div>
  )
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** Contextual install help: the browser's prompt where offered, instructions for Safari otherwise. */
export function InstallGuidance() {
  const [, rerender] = useState(0)
  useEffect(() => {
    const listener = () => rerender((count) => count + 1)
    installListeners.add(listener)
    return () => { installListeners.delete(listener) }
  }, [])
  if (isStandalone()) return null
  const appleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return (
    <section className={cn(labelCardClassName, paddedClassName)} aria-labelledby="install-title">
      <h2 id="install-title">{pwaText.installTitle}</h2>
      {deferredInstall ? (
        <Button variant="outline" type="button" onClick={async () => {
          const prompt = deferredInstall
          deferredInstall = null
          await prompt?.prompt()
          rerender((count) => count + 1)
        }}>{pwaText.install}</Button>
      ) : appleMobile ? (
        <p className={mutedClassName}>{pwaText.safariInstructions}</p>
      ) : (
        <p className={mutedClassName}>{pwaText.browserInstructions}</p>
      )}
    </section>
  )
}
