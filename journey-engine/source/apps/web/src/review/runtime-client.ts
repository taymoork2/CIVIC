import type { RuntimeSession as CivicRuntimeSession } from '@civic/canvas/runtime-session'
export { runtimeRequest, runtimeTransport } from '@civic/canvas/runtime-session'

/** Laundry's run seed: the synthetic household, signed-in principal and the pieces its fixtures name. */
export type RuntimeSession = CivicRuntimeSession<{ scenario: string; householdId: string; principalKey: string; subject: string; textiles: string[]; towels: string[] }>
