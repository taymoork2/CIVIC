import * as Effect from 'effect/Effect'
import * as Schedule from 'effect/Schedule'
import * as Option from 'effect/Option'

export const waitUntil = (check: Effect.Effect<boolean>, interval: number, timeout: number) => check.pipe(
  Effect.repeat({ schedule: Schedule.spaced(interval), until: (ready) => ready }),
  Effect.timeoutOption(timeout),
  Effect.map(Option.getOrElse(() => false)),
)
