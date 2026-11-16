import * as Effect from 'effect/Effect'
import * as Schedule from 'effect/Schedule'

export const waitUntil = (check: Effect.Effect<boolean>, interval: number, timeout: number) => check.pipe(
  Effect.repeat({ schedule: Schedule.spaced(interval), until: (ready) => ready }),
  Effect.timeoutOption(timeout),
  Effect.map((result) => result._tag === 'Some' && result.value),
)
