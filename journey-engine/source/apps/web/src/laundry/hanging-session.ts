import type { FunctionReturnType } from 'convex/server'
import type { api } from '@/api'
type Sessions = FunctionReturnType<typeof api.execution.householdSessions>

/** The finished load a hanging garment came out of: the latest one that washed it. */
export function hangingSession(sessions: Sessions, textileId: string): string | null {
  const loads = sessions
    .filter((session) => session.status === 'completed' && (session.textileIds as readonly string[]).includes(textileId))
    .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))
  return loads[0]?.sessionId ?? null
}
