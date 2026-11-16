import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import { initialTransition, isUnhandled, transition } from 'xstate'
import type { AnyStateMachine, EventFromLogic, SnapshotFrom } from 'xstate'

export const initial = <M extends AnyStateMachine>(...input: Parameters<typeof initialTransition<M>>) => {
  const [snapshot, effects] = initialTransition(...input)
  if (effects.length > 0) throw new Error('Durable machines must initialize without effects')
  return snapshot
}

export const decide = <M extends AnyStateMachine, Intent extends { type: string } = never>(
  machine: M, snapshot: SnapshotFrom<M>, event: EventFromLogic<M>,
  isIntent: (value: unknown) => value is Intent = (_value): _value is Intent => false,
) => {
  const result = transition(machine, snapshot, event)
  const intents: Intent[] = []
  for (const effect of result[1]) {
    // Reaching a final state only marks the lifecycle done; nothing runs.
    if (effect.type === '@xstate.terminate') continue
    if (effect.kind !== 'emit' || !isIntent(effect.event)) throw new Error(`Durable machines cannot execute ${effect.type}`)
    intents.push(effect.event)
  }
  return isUnhandled(snapshot, result) ? Option.none() : Option.some({ snapshot: result[0], intents })
}

// Persist owns the transaction and compare-and-set, including durable intents.
export const commit = <Row, A, E, R>(read: Effect.Effect<Row, E, R>, persist: (row: Row) => Effect.Effect<A, E, R>, conflict: (error: E) => boolean): Effect.Effect<A, E, R> => {
  const attempt = Effect.gen(function* () {
    return yield* persist(yield* read)
  })
  return attempt.pipe(Effect.catchIf(conflict, () => attempt))
}
