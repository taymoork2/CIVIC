import { Profile, type CareHistoryRow } from '@/routes/me'
import type { Id } from '@convex/_generated/dataModel'

const now = Date.UTC(2026, 9, 2, 19)

// In-memory completed sessions only; these IDs never reach a backend query.
const history: CareHistoryRow[] = [
  { sessionId: 'preview:load-whites' as Id<'sessions'>, title: 'White cotton tee, White towel', textileCount: 6, completedAt: now - 2 * 86_400_000, washPrice: 2.5 },
  { sessionId: 'preview:load-dark' as Id<'sessions'>, title: 'Navy T-shirt, Indigo jeans', textileCount: 4, completedAt: now - 6 * 86_400_000, washPrice: 2.75 },
]

// Long and missing content plus enough rows to inspect the real recent/all disclosure.
const extendedHistory: CareHistoryRow[] = [
  ...history,
  { sessionId: 'preview:load-linen' as Id<'sessions'>, title: 'Guest-room duvet cover, Pillowcases, Fitted cotton sheet', textileCount: 8, completedAt: now - 8 * 86_400_000, washPrice: null },
  { sessionId: 'preview:load-knitwear' as Id<'sessions'>, title: 'Merino wool cardigan', textileCount: 1, completedAt: now - 10 * 86_400_000, washPrice: 0 },
  { sessionId: 'preview:load-shirts' as Id<'sessions'>, title: 'Oxford shirts, Cotton work trousers', textileCount: 12, completedAt: now - 12 * 86_400_000, washPrice: 3.5 },
  { sessionId: 'preview:load-sports' as Id<'sessions'>, title: 'PerformanceRunningTopWithAnUnusuallyLongRecordedName', textileCount: 3, completedAt: now - 14 * 86_400_000, washPrice: null },
  { sessionId: 'preview:load-towels' as Id<'sessions'>, title: 'Gray bath towels', textileCount: 5, completedAt: now - 16 * 86_400_000, washPrice: 2.25 },
]

export function MePreview({ variant = 'empty', loading = false }: { variant?: 'empty' | 'priced' | 'history'; loading?: boolean }) {
  const extended = variant === 'history'
  return (
    <Profile
      name={extended ? 'Alexandra Rivera-Montgomery' : 'Alex Rivera'}
      email={extended ? 'alexandra.rivera.montgomery@example.com' : 'alex@example.com'}
      householdName={extended ? 'Rivera-Montgomery family household' : 'Our apartment'}
      role={extended ? 'member' : 'owner'}
      history={extended ? extendedHistory : variant === 'priced' ? history : []}
      loading={loading}
      onAccount={() => {}}
      onSettings={() => {}}
      onOpenWash={() => {}}
    />
  )
}
