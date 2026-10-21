import { useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type Appearance = { preference: ThemePreference; resolved: 'light' | 'dark'; system?: 'light' | 'dark' }
export type AppearanceBridge = {
  appearance: () => Promise<Appearance>
  setAppearance: (preference: ThemePreference) => Promise<Appearance>
  onAppearance: (listener: (appearance: Appearance) => void) => () => void
}
const key = 'civic:appearance'
let state: Appearance & { error?: string } = { preference: 'system', resolved: 'light' }
let media: MediaQueryList
let bridge: AppearanceBridge | undefined
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const preference = (value: unknown): ThemePreference => value === 'light' || value === 'dark' ? value : 'system'
const browserAppearance = (value: ThemePreference): Appearance => ({ preference: value, resolved: value === 'system' ? media.matches ? 'dark' : 'light' : value, system: media.matches ? 'dark' : 'light' })
const publish = (value: typeof state) => {
  state = value
  document.documentElement.dataset.civicTheme = value.resolved
  document.documentElement.style.colorScheme = value.resolved
  for (const listener of listeners) listener()
}

/** Initialize once, before mounting the shell; previews retain their own appearance. */
export async function initializeTheme(desktop?: AppearanceBridge) {
  bridge = desktop
  media = window.matchMedia('(prefers-color-scheme: dark)')
  if (desktop) {
    desktop.onAppearance(publish)
    try { publish(await desktop.appearance()) }
    catch { publish({ ...browserAppearance('system'), error: 'Appearance could not be loaded. Using the system theme.' }) }
  } else {
    let stored: string | null = null
    try { stored = localStorage.getItem(key) } catch { /* Blocked storage uses this window's preference. */ }
    publish(browserAppearance(preference(stored)))
    media.addEventListener('change', () => publish(browserAppearance(state.preference)))
    window.addEventListener('storage', event => { if (event.storageArea === localStorage && (event.key === key || event.key === null)) publish(browserAppearance(preference(event.newValue))) })
  }
}

export async function setThemePreference(value: ThemePreference) {
  if (!['system', 'light', 'dark'].includes(value)) throw Error('Invalid appearance preference')
  if (bridge) {
    try { publish(await bridge.setAppearance(value)) }
    catch { publish({ ...state, error: 'Appearance could not be saved. Your previous preference is retained.' }) }
  } else {
    let error: string | undefined
    try { localStorage.setItem(key, value) }
    catch { error = 'Appearance applies to this window, but could not be saved.' }
    publish({ ...browserAppearance(value), error })
  }
}

export function useShellTheme() {
  return useSyncExternalStore(subscribe, () => state)
}
