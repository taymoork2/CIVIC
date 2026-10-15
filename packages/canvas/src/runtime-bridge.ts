export type RuntimeGesture = { kind: string; value?: string; target?: { tag: string; name: string; index: number; count: number }; checked?: boolean }
/** `actor` names the synthetic account that made a write after the run switched accounts; a run that never switched records none. */
export type RuntimeOperation = { kind: 'mutation' | 'action'; name: string; args: unknown; actor?: string; result?: unknown; error?: string }
/**
 * A component the step settled on showing, as the app marks it with its stable CIVIC IDs (D31):
 * the platform component, the contract variant and state, and the props it names. CIVIC
 * harvests a component's real usage from these (decision 0013). Only steps of an app that
 * marks its components carry them, so other tapes stay as they were.
 */
export type RuntimeComponent = { component: string; variant?: string; state?: string; props?: Record<string, string> }
export type RuntimeStep = { gesture: RuntimeGesture; route: string; fields: { label: string; value: string }[]; view: string; components?: RuntimeComponent[]; operations: RuntimeOperation[] }
export type RuntimeRecording = { version: 1; project: string; source: string; seed: unknown; now: number; initialRoute: string; steps: RuntimeStep[] }
export type RuntimePorts = {
  project: string; source: string; seed: unknown; now: number
  route: () => string; fields: () => RuntimeStep['fields']; view: () => string
  components?: () => RuntimeComponent[]
  subscribe?: (changed: () => void) => () => void
  assertSource: () => Promise<void>; reset: (recording: RuntimeRecording) => Promise<void>
  settle: () => Promise<void>; interact: (gesture: RuntimeGesture) => Promise<void>
}

/** No framework, router, backend or screen names belong in this recorder. */
export function createRuntimeBridge(ports: RuntimePorts) {
  const tape: RuntimeRecording = { version: 1, project: ports.project, source: ports.source, seed: structuredClone(ports.seed), now: ports.now, initialRoute: ports.route(), steps: [] }
  const pending = new Set<Promise<unknown>>()
  const sealed = new WeakSet<RuntimeStep>()
  let current: RuntimeStep | null = null, replaying = false
  let replayDone: Promise<void> | null = null
  let mismatch: { step: number; expected: RuntimeStep; actual: RuntimeStep } | null = null
  const snapshot = (step: RuntimeStep) => {
    Object.assign(step, { route: ports.route(), fields: structuredClone(ports.fields()), view: ports.view() })
    const components = ports.components?.() ?? []
    if (components.length) step.components = structuredClone(components)
    else delete step.components
    return step
  }
  const seal = () => { if (current && !sealed.has(current)) { snapshot(current); sealed.add(current) } }
  let finalizing = Promise.resolve()
  // A settle that has not started yet serves every flush asked for the same step meanwhile, so frequent callers
  // (a panel counting steps on each run event) never queue a settle each; each flush still settles after its call.
  let waiting: { step: RuntimeStep | null; done: Promise<void> } | null = null
  const flush = () => {
    const step = current
    if (waiting && waiting.step === step) return waiting.done
    const entry: { step: RuntimeStep | null; done: Promise<void> } = { step, done: Promise.resolve() }
    entry.done = finalizing = finalizing.then(async () => {
      if (waiting === entry) waiting = null
      while (pending.size) await Promise.allSettled([...pending])
      await ports.settle()
      if (step && !sealed.has(step)) snapshot(step)
    })
    waiting = entry
    return entry.done
  }
  const bridge = {
    prepare(target?: RuntimeGesture['target']) {
      if (!replaying && !(target && current?.gesture.kind === 'input' && JSON.stringify(target) === JSON.stringify(current.gesture.target))) seal()
    },
    record(gesture: RuntimeGesture) {
      if (replaying) return
      if (current?.gesture.kind === 'input' && gesture.kind === 'input' && !sealed.has(current) && !current.operations.length && JSON.stringify(current.gesture.target) === JSON.stringify(gesture.target)) { current.gesture = structuredClone(gesture); return }
      seal()
      if (tape.steps.length >= 1000) throw Error('Recording limit reached. Save this run and start another.')
      current = { gesture: structuredClone(gesture), route: ports.route(), fields: [], view: '', operations: [] }
      tape.steps.push(current)
    },
    operation<T>(kind: RuntimeOperation['kind'], name: string, args: unknown, execute: () => Promise<T>, actor?: string): Promise<T> {
      const step = current
      const receipt: RuntimeOperation = { kind, name, args: structuredClone(args), ...(actor ? { actor } : {}) }
      step?.operations.push(receipt)
      const work = Promise.resolve().then(execute).then((result) => { if (result !== undefined) receipt.result = structuredClone(result); return result }, (error) => { receipt.error = (error as Error).message; throw error })
      pending.add(work)
      void work.finally(() => pending.delete(work)).catch(() => {})
      return work
    },
    flush,
    recording: async () => { if (replayDone) await replayDone; await flush(); return structuredClone(tape) },
    async replay(input: RuntimeRecording) {
      if (!input || input.version !== 1 || input.project !== ports.project || input.source !== ports.source) throw Error('Recording belongs to another project or source revision.')
      if (input.now !== ports.now || JSON.stringify(input.seed) !== JSON.stringify(ports.seed)) throw Error('Recording uses a different seed or clock. Open its original starting preset.')
      if (!Array.isArray(input.steps) || input.steps.length > 1000 || JSON.stringify(input).length > 2_000_000) throw Error('Invalid or oversized recording.')
      if (replaying) throw Error('Replay is already running.')
      await flush(); await ports.assertSource()
      replaying = true
      let finished!: () => void
      replayDone = new Promise<void>((resolve) => { finished = resolve })
      mismatch = null
      try {
        await ports.reset(input); await ports.settle()
        if (ports.route() !== input.initialRoute) throw Error('Replay starting route differs from the recording.')
        for (const [index, expected] of input.steps.entries()) {
          await ports.assertSource()
          current = { gesture: expected.gesture, route: '', fields: [], view: '', operations: [] }
          await ports.interact(expected.gesture); await flush()
          // A tape recorded before components were marked (or from an app that marks none) checks the rest.
          if (!expected.components) delete current.components
          if (JSON.stringify(ordered(current)) !== JSON.stringify(ordered(expected))) {
            mismatch = { step: index + 1, expected: structuredClone(expected), actual: structuredClone(current) }
            throw Error(`Replay diverged at step ${index + 1}. Inspect the captured inputs, route and operation receipts.`)
          }
        }
        tape.steps = structuredClone(input.steps)
        return { verified: input.steps.length }
      } finally { current = null; replaying = false; finished(); replayDone = null }
    },
    isReplaying: () => replaying,
    mismatch: () => mismatch,
  }
  return bridge
}

export type RuntimeBridge = ReturnType<typeof createRuntimeBridge>

/** A step's keys in the recorder's order, so a tape read back from JSON compares equal. */
function ordered(step: RuntimeStep): RuntimeStep {
  return { gesture: step.gesture, route: step.route, fields: step.fields, view: step.view, ...(step.components ? { components: step.components } : {}), operations: step.operations }
}
