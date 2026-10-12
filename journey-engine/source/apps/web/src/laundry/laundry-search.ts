/**
 * Laundry, the home tab: the hamper, the pass and running loads. `plan` is the open plan (the pass
 * it was made with comes back from it); `add=hamper` opens Add dirty clothes once, and Laundry
 * handles it. An older `planId` link opens the same plan.
 */
export type LaundrySearch = { plan?: string; load?: string; add?: 'hamper'; make?: 'loads'; item?: string }

export function laundrySearch(search: Record<string, unknown>): LaundrySearch {
  const plan = typeof search.plan === 'string' ? search.plan : typeof search.planId === 'string' ? search.planId : undefined
  return {
    ...(plan === undefined ? {} : { plan }),
    ...(plan !== undefined && typeof search.load === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(search.load) ? { load: search.load } : {}),
    ...(search.add === 'hamper' ? { add: 'hamper' as const } : {}),
    ...(search.make === 'loads' ? { make: 'loads' as const } : {}),
    ...(typeof search.item === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(search.item) ? { item: search.item } : {}),
  }
}
