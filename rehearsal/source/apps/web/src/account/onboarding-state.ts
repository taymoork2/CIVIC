import { useSyncExternalStore } from 'react'

import { guidanceCopy } from '@/copy-setup'

/**
 * Whether first-run screens are on show. Creating or joining a household makes membership appear
 * while the celebration and optional setup are still to come, so while this is true the app keeps
 * showing onboarding, with no tabs, instead of dropping into Home. The flag is kept in this tab's
 * sessionStorage, so a reload during the celebration or setup comes back to setup rather than Home,
 * and it ends with the tab. Where storage is blocked it lives in memory only.
 */
const storageKey = 'washcloset:onboarding-hold'
let active: boolean | undefined
let celebration: 'created' | 'joined' | null | undefined
const listeners = new Set<() => void>()

export type GuidanceStage = 'intent' | 'setup' | 'household' | 'clothes' | 'laundry'
export type GuidanceStatus = { readonly status: 'not_started' | 'started' | 'dismissed' | 'completed'; readonly stage: GuidanceStage }

/**
 * Resume the saved task, without reopening intake over an existing laundry plan. The intent
 * chooser is never a resume target: an unchosen start continues at the setup checklist.
 */
export function guidanceDestination(stage: GuidanceStage) {
  if (stage === 'laundry') return { to: '/laundry' as const }
  if (stage === 'clothes') return { to: '/closet' as const, search: { add: 'choose' as const } }
  if (stage === 'household') return { to: '/household' as const }
  return { to: '/setup' as const }
}

/** Home scenes where the hero already opens the care task, so a second Resume would repeat it. */
const taskScenes: ReadonlySet<string> = new Set(['planned', 'blocked', 'running', 'finished', 'drying', 'hamper'])

export type GuidanceAction =
  | { readonly kind: 'resume'; readonly label: string; readonly stage: Exclude<GuidanceStage, 'intent'> }
  | { readonly kind: 'replay'; readonly label: string }

/**
 * Home's guidance row. Completed guidance offers a quiet Replay; unfinished guidance names its
 * task, unless the hero already leads with a care task. A dismissal at the chooser or checklist
 * stays dismissed: the setup card covers what is still unset.
 */
export function guidanceAction(guidance: GuidanceStatus | undefined, heroScene: string): GuidanceAction | null {
  if (guidance === undefined || guidance.status === 'not_started') return null
  if (guidance.status === 'completed') return { kind: 'replay', label: guidanceCopy.replay }
  if (taskScenes.has(heroScene)) return null
  const stage = guidance.stage === 'intent' ? 'setup' : guidance.stage
  if (guidance.status === 'dismissed' && stage === 'setup') return null
  return { kind: 'resume', label: guidanceCopy.resume[stage], stage }
}

function stored(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(storageKey) !== null
  } catch {
    return false
  }
}

function current(): boolean {
  active ??= stored()
  return active
}

function set(value: boolean) {
  if (current() === value) return
  active = value
  try {
    if (value) window.sessionStorage.setItem(storageKey, '1')
    else window.sessionStorage.removeItem(storageKey)
  } catch {
    // Blocked storage keeps the hold for this page view only.
  }
  for (const listener of listeners) listener()
}

/** Keep the post-membership celebration through an auth/query remount, until its explicit exit. */
export function onboardingCelebration(): 'created' | 'joined' | null {
  if (celebration !== undefined) return celebration
  try {
    const value = typeof window === 'undefined' ? null : window.sessionStorage.getItem(storageKey)
    celebration = value === 'created' || value === 'joined' ? value : null
  } catch { celebration = null }
  return celebration
}

export function finishOnboardingCelebration() {
  celebration = null
  try { if (current()) window.sessionStorage.setItem(storageKey, '1') } catch { /* Memory retains the choice. */ }
}

export const beginOnboarding = (kind?: 'created' | 'joined') => {
  celebration = kind ?? null
  set(true)
  if (kind !== undefined) {
    try { window.sessionStorage.setItem(storageKey, kind) } catch { /* Memory retains the choice. */ }
  }
}
export const endOnboarding = () => { celebration = null; set(false) }

export function useOnboardingActive(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    current,
    () => false,
  )
}
