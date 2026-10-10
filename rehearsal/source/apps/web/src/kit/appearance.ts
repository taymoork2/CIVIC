/**
 * How the app looks on this device: light, dark or the system's choice, and the Cobalt or
 * Marigold palette. Stored per device and not private, so it outlives sign-out. The choice lands on
 * <html> as `data-theme` (absent for System) and `data-palette`; the tokens read those attributes.
 */
export type ThemeChoice = 'system' | 'light' | 'dark'
export type PaletteChoice = 'cobalt' | 'marigold'
export type MaterialChoice = 'glass' | 'tonal'
export type MotionChoice = 'system' | 'reduce' | 'full'
export type Appearance = { readonly theme: ThemeChoice; readonly palette: PaletteChoice; readonly material?: MaterialChoice; readonly motion?: MotionChoice; readonly alerts?: boolean }

export const themeChoices: readonly ThemeChoice[] = ['system', 'light', 'dark']
export const paletteChoices: readonly PaletteChoice[] = ['cobalt', 'marigold']
export const defaultAppearance: Appearance = { theme: 'system', palette: 'cobalt' }

const storageKey = 'washcloset:prefs:appearance'

/** A stored value, or the default for anything missing or unreadable. */
export function appearanceFrom(raw: string | null | undefined): Appearance {
  try {
    const value = raw === null || raw === undefined ? null : JSON.parse(raw) as Partial<Record<keyof Appearance, unknown>> | null
    const theme = themeChoices.find((choice) => choice === value?.theme) ?? defaultAppearance.theme
    const palette = paletteChoices.find((choice) => choice === value?.palette) ?? defaultAppearance.palette
    return { theme, palette, ...(value?.material === 'glass' || value?.material === 'tonal' ? { material: value.material } : {}),
      ...(value?.motion === 'system' || value?.motion === 'reduce' || value?.motion === 'full' ? { motion: value.motion } : {}),
      ...(typeof value?.alerts === 'boolean' ? { alerts: value.alerts } : {}) }
  } catch {
    return defaultAppearance
  }
}

export function loadAppearance(): Appearance {
  try {
    return appearanceFrom(typeof window === 'undefined' ? null : window.localStorage.getItem(storageKey))
  } catch {
    return defaultAppearance
  }
}

export function saveAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(appearance))
  } catch {
    // Blocked storage keeps the choice for this visit only.
  }
}

/** The theme actually painted: System follows the device's own light or dark preference. */
export function resolvedTheme(theme: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  return theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
}

/** Puts the choice on the root element: no `data-theme` means follow the system. */
export function applyAppearance(appearance: Appearance, root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement): void {
  if (root === null) return
  if (appearance.theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', appearance.theme)
  root.setAttribute('data-palette', appearance.palette)
  root.setAttribute('data-material', appearance.material ?? 'glass')
  root.setAttribute('data-motion', appearance.motion ?? 'system')
}

/** Runs before the page paints, so a stored Dark or Marigold never flashes the default first. */
export const appearanceBootScript = `(function(){try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})||'null')||{};var r=document.documentElement;if(v.theme==='light'||v.theme==='dark')r.setAttribute('data-theme',v.theme);r.setAttribute('data-palette',v.palette==='marigold'?'marigold':'cobalt');r.setAttribute('data-material',v.material==='tonal'?'tonal':'glass');r.setAttribute('data-motion',v.motion==='reduce'?'reduce':v.motion==='full'?'full':'system')}catch(e){}})()`
