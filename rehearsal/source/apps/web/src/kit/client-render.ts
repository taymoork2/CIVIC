import { useSyncExternalStore } from 'react'

const noSubscription = () => () => {}

/**
 * False only while React hydrates server HTML; true for every client render after that, later mounts
 * included. Device-only state (saved filters, drafts) can then be read while rendering on a tab change
 * instead of after mount, so a cached page never flashes a loading state.
 */
export function useClientRender(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false)
}
