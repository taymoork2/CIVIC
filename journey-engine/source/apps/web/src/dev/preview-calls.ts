/**
 * Simulated calls for the dev-only design specimens. Each one names what the real control would do,
 * so an inert control in a specimen is labeled in code and announces itself in the console when used.
 * Specimens only; no production presenter imports this module.
 */

/** The message a specimen shows when a save is tried; preview e2e reads it. */
export const previewSaveMessage = 'This visual preview does not save changes.'

/** A control that would `label` in the app; the specimen only logs it. */
export function previewCall(label: string): () => void {
  return () => console.info(`Preview only: would ${label}`)
}

/** A save that would `label` in the app; the specimen refuses it with the preview message. */
export function previewUnavailable(label: string): () => Promise<never> {
  return async () => {
    console.info(`Preview only: would ${label}`)
    throw new Error(previewSaveMessage)
  }
}

/** A `useConvexCall`-shaped call that resolves without saving. */
export function previewConvexCall(label: string) {
  return { pending: false, error: null, clearError: previewCall('clear the error'), run: async (..._args: unknown[]) => { previewCall(label)(); return undefined } }
}

/** A record of refused saves, one labeled `previewUnavailable` per call name. */
export function previewUnavailableCalls<K extends string>(labels: Readonly<Record<K, string>>): Record<K, () => Promise<never>> {
  return Object.fromEntries(Object.entries<string>(labels).map(([key, label]) => [key, previewUnavailable(label)])) as Record<K, () => Promise<never>>
}
