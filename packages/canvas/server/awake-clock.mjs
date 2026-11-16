import { Clock, Duration, Effect } from 'effect'

// Late ticks represent suspend or an unresponsive event loop, not proof of dead work.
export function awakeSleep(duration) {
  return Effect.gen(function* () {
    let remaining = Duration.toMillis(Duration.fromInputUnsafe(duration))
    let previous = yield* Clock.currentTimeMillis
    while (remaining > 0) {
      yield* Effect.sleep(Math.min(1000, remaining))
      const now = yield* Clock.currentTimeMillis
      const elapsed = now - previous
      if (elapsed >= 0 && elapsed <= 5000) remaining -= elapsed
      previous = now
    }
  })
}

export const awakeTimeout = (effect, duration, orElse = () => Effect.fail(Error('Operation timed out'))) =>
  Effect.raceFirst(effect, Effect.andThen(awakeSleep(duration), Effect.suspend(orElse)))

export const awakeClock = Clock.clockWith(clock => Effect.succeed(Object.assign(Object.create(clock), { sleep: duration =>
  Effect.provideService(awakeSleep(duration), Clock.Clock, clock) })))
