import { createContext, type ReactNode } from 'react'

export const FeedbackContext = createContext<((onClose: () => void, step?: string) => ReactNode) | null>(null)

/** Share stable screen names, never private route IDs, query strings or record titles. */
export function feedbackScreen(path: string, step?: string): string {
  const screen = ['/', '/closet', '/laundry', '/household', '/me', '/account', '/settings', '/drying', '/setup'].includes(path) ? path : path.startsWith('/session/') ? '/session/:id' : '/app'
  const knownStep = ['type', 'whose', 'details', 'fabric', 'color', 'origin', 'dye', 'care', 'care:wash', 'care:bleach', 'care:dry', 'stain', 'final', 'label', 'form', 'purpose', 'identity', 'measurement', 'review', 'controls', 'edit'].includes(step ?? '')
  return knownStep ? `${screen} · ${step}` : screen
}
