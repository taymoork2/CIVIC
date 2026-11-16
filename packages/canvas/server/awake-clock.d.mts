import type { Clock, Duration, Effect } from 'effect'

export declare function awakeSleep(duration: Duration.Input): Effect.Effect<void>
export declare function awakeTimeout<A, E, R, B = never, E2 = Error, R2 = never>(
  effect: Effect.Effect<A, E, R>, duration: Duration.Input, orElse?: () => Effect.Effect<B, E2, R2>,
): Effect.Effect<A | B, E | E2, R | R2>
export declare const awakeClock: Effect.Effect<Clock.Clock>
