import { describeGesture, viewOf, type RecordedStep, type RecordedTape } from './replay-player.ts'

// Expected state per journey step (decision 0017). A replay that verifies every step only proves
// the app does what it did when it was recorded, so a label that was wrong at recording time
// replays "correctly". A journey declares what must be true after a step, in the terms a person
// would check: a control named so, a status text, a component in a state. A recorded run is read
// against it, and a miss names the step, what was expected and what the step showed instead.
// Read-only and deterministic; no model calls (D30).

export const EXPECTATIONS_SCHEMA = 'civic.expectations/0'

/**
 * One thing that must be true after a step, in one of four shapes: a control (`role` and/or
 * `name`, with its `disabled`, `pressed`, `selected`, `checked` or `expanded` state), a `text`, a
 * `component` (with its `state` or `variant`) or a `route`. `absent` turns it round: it must not be.
 */
export interface Expected {
  absent?: boolean
  role?: string
  name?: string
  disabled?: boolean
  pressed?: boolean
  selected?: boolean
  checked?: boolean
  expanded?: boolean
  text?: string
  component?: string
  state?: string
  variant?: string
  route?: string
}

/** The step a run is checked after: its number in the tape, or the first (`nth`) step with this gesture. */
export type StepSelector = { step: number } | { gesture: string; target?: string; nth?: number }

export interface StepExpectation {
  after: StepSelector
  expect: Expected[]
}

export interface ScenarioExpectations {
  /** The scenario the run starts from, as a replay record names it. */
  scenario: string
  /** The journey this describes, for whoever reads a failure. */
  journey?: string
  steps: StepExpectation[]
}

export interface ExpectationsFile {
  schema: typeof EXPECTATIONS_SCHEMA
  scenarios: ScenarioExpectations[]
}

export interface ExpectationFailure {
  /** The step's number in the tape, when one matched. */
  step?: number
  /** What was done at the step, in words. */
  did: string
  expected: string
  actual: string
}

/** What a step showed, as far as the tape records it. */
interface StepState {
  controls?: { role: string; name: string; disabled: boolean; pressed?: string; selected?: string; checked?: string; expanded?: string }[]
  texts: string[]
  components: NonNullable<RecordedStep['components']>
  route: string
}

const FLAGS = ['disabled', 'pressed', 'selected', 'checked', 'expanded'] as const

/** Reads and checks an expectations file, naming what is wrong with it. */
export function readExpectations(value: unknown): ExpectationsFile {
  const file = value as ExpectationsFile
  if (file?.schema !== EXPECTATIONS_SCHEMA || !Array.isArray(file.scenarios)) throw new Error(`Not an expectations file: expected schema "${EXPECTATIONS_SCHEMA}" and a list of scenarios.`)
  for (const [index, entry] of file.scenarios.entries()) {
    const at = `scenarios[${index}]`
    if (typeof entry?.scenario !== 'string' || !Array.isArray(entry.steps)) throw new Error(`${at} needs the scenario the run starts from and its steps.`)
    for (const [number, step] of entry.steps.entries()) {
      const where = `${at}.steps[${number}]`
      const after = step?.after as { step?: unknown; gesture?: unknown } | undefined
      if (!after || (typeof after.step !== 'number' && typeof after.gesture !== 'string')) throw new Error(`${where}.after names a step number or a gesture.`)
      if (!Array.isArray(step.expect) || step.expect.length === 0) throw new Error(`${where}.expect lists what must be true.`)
      for (const expected of step.expect as Record<string, unknown>[]) {
        const shapes = ['name', 'role', 'text', 'component', 'route'].filter((key) => typeof expected?.[key] === 'string')
        if (shapes.length === 0 || (shapes.includes('text') || shapes.includes('component') || shapes.includes('route')) && shapes.length > 1) throw new Error(`${where}.expect: say a control (role, name), a text, a component or a route.`)
        for (const flag of FLAGS) if (flag in expected && typeof expected[flag] !== 'boolean') throw new Error(`${where}.expect: ${flag} is true or false.`)
      }
    }
  }
  return file
}

/** Checks one recorded run against what its scenario's journey expects. Empty when everything held. */
export function checkExpectations(tape: RecordedTape, entry: ScenarioExpectations): ExpectationFailure[] {
  const failures: ExpectationFailure[] = []
  for (const { after, expect } of entry.steps) {
    const number = stepNumber(tape, after)
    if (number === undefined) {
      failures.push({ did: 'the recorded run', expected: `a step ${'step' in after ? `number ${after.step}` : `that ${after.gesture}s${after.target ? ` “${after.target}”` : ''}${after.nth ? ` (the ${after.nth}th)` : ''}`}`, actual: `the run has ${tape.steps.length} step${tape.steps.length === 1 ? '' : 's'}, none like it` })
      continue
    }
    const step = tape.steps[number - 1]!
    const state = stateOf(step)
    for (const expected of expect) {
      const miss = check(expected, state)
      if (miss) failures.push({ step: number, did: describeGesture(step.gesture), ...miss })
    }
  }
  return failures
}

/** The failures as text, one block each. */
export function renderExpectationFailures(failures: readonly ExpectationFailure[]): string {
  return failures.map((failure) => `${failure.step ? `Step ${failure.step}` : 'No step'} (${failure.did}):\n  expected ${failure.expected}\n  but     ${failure.actual}`).join('\n')
}

function stepNumber(tape: RecordedTape, after: StepSelector): number | undefined {
  if ('step' in after) return after.step >= 1 && after.step <= tape.steps.length ? after.step : undefined
  const matches = tape.steps.flatMap((step, index) => (step.gesture.kind === after.gesture && (after.target === undefined || step.gesture.target?.name === after.target) ? [index + 1] : []))
  return matches[(after.nth ?? 1) - 1]
}

function stateOf(step: RecordedStep): StepState {
  const after = step.discovery?.after
  return {
    ...(after ? { controls: after.controls } : {}),
    texts: [...viewOf(step), ...(after?.landmarks ?? [])],
    components: step.components ?? [],
    route: step.route,
  }
}

const quote = (text: string) => `“${text}”`
const list = (items: string[]) => (items.length === 0 ? 'none' : items.slice(0, 8).join(', ') + (items.length > 8 ? `, and ${items.length - 8} more` : ''))

function check(expected: Expected, state: StepState): { expected: string; actual: string } | undefined {
  const present = !expected.absent
  if (expected.text !== undefined) {
    // The tape holds headings, dialog and tab names, the controls' names and components' states, not every word on screen.
    const seen = [...state.texts, ...(state.controls ?? []).map((control) => control.name), ...state.components.flatMap((component) => [component.state, ...Object.values(component.props ?? {})].filter((value): value is string => Boolean(value)))]
    const found = seen.includes(expected.text)
    return found === present ? undefined : { expected: `${present ? '' : 'no '}text ${quote(expected.text)}`, actual: found ? 'it was shown' : `the step showed ${list(seen.map(quote))}` }
  }
  if (expected.component !== undefined) {
    const match = state.components.filter((component) => component.component === expected.component && (expected.state === undefined || component.state === expected.state) && (expected.variant === undefined || component.variant === expected.variant))
    const label = `component ${expected.component}${expected.state ? ` in state ${expected.state}` : ''}${expected.variant ? `, variant ${expected.variant}` : ''}`
    if ((match.length > 0) === present) return undefined
    return { expected: `${present ? '' : 'no '}${label}`, actual: present ? `the step marked ${list(state.components.map((component) => `${component.component}${component.state ? ` (${component.state})` : ''}`))}` : 'it was shown' }
  }
  if (expected.route !== undefined) return (state.route === expected.route) === present ? undefined : { expected: `${present ? 'the route' : 'not the route'} ${expected.route}`, actual: `the route was ${state.route}` }

  const label = `a ${expected.role ?? 'control'}${expected.name === undefined ? '' : ` named ${quote(expected.name)}`}${FLAGS.filter((flag) => expected[flag] !== undefined).map((flag) => `, ${expected[flag] ? '' : 'not '}${flag}`).join('')}`
  if (!state.controls) return { expected: `${present ? '' : 'no '}${label}`, actual: 'the run was recorded without the controls each step offers, so it cannot say; record it again with discovery on' }
  const match = state.controls.filter((control) => (expected.role === undefined || control.role === expected.role) && (expected.name === undefined || control.name === expected.name) && FLAGS.every((flag) => expected[flag] === undefined || (flag === 'disabled' ? control.disabled : control[flag] === 'true') === expected[flag]))
  if ((match.length > 0) === present) return undefined
  if (!present) return { expected: `no ${label}`, actual: `it was there${match.length > 1 ? ` ${match.length} times` : ''}` }
  const near = state.controls.filter((control) => (expected.role === undefined || control.role === expected.role) || control.name === expected.name)
  return { expected: label, actual: `the step offered ${list(near.map((control) => `${control.role} ${quote(control.name)}`))}` }
}
