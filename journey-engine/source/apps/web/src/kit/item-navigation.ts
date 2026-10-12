import type { AnyRouter } from '@tanstack/react-router'

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** The page that pushed this item drawer; absent on a copied/direct link. */
    itemReturnTo?: string
  }
}

/** Close an app-opened drawer with Back, preserving Forward; direct links replace with their list. */
export function dismissItem(router: Pick<AnyRouter, 'state' | 'history'>, fallback: () => void): void {
  const state = router.state.location.state
  // A mask's internal location retains its old index; the committed history owns Back.
  if (state.itemReturnTo !== undefined && router.history.location.state.__TSR_index > 0) router.history.back()
  else fallback()
}
