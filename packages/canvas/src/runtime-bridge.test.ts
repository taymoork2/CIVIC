import { expect, test } from 'vitest'
import { createRuntimeBridge } from './runtime-bridge'
import type { InteractionState } from './runtime-dom'

test('binds execution evidence to the exact before and after interaction states and checks it on replay', async () => {
  const before: InteractionState = { scenario: 'home', persona: 'owner', role: 'browse', condition: 'live', viewport: { width: 1440, height: 900 }, controls: [{ tag: 'button', role: 'button', name: 'Menu', index: 0, count: 1, disabled: false, expanded: 'false' }], landmarks: [], truncated: false }
  const after = structuredClone(before); after.controls[0]!.expanded = 'true'; after.landmarks = ['Menu']
  let state = before
  const bridge = createRuntimeBridge({ project: 'app', source: 'source', seed: {}, now: 0, route: () => '/', fields: () => [], view: () => '', discover: () => state, assertSource: async () => {}, settle: async () => {}, reset: async () => { state = before }, interact: async () => { state = after } })
  bridge.record({ kind: 'click', target: { tag: 'button', name: 'Menu', index: 0, count: 1 } }); state = after
  const tape = await bridge.recording()
  expect(tape.steps[0]!.discovery).toEqual({ before, after })
  expect(await bridge.replay(tape)).toEqual({ verified: 1 })
  const drift = structuredClone(tape); drift.steps[0]!.discovery!.after.controls[0]!.expanded = 'false'
  await expect(bridge.replay(drift)).rejects.toThrow('Replay diverged')
})

function notebook(components?: () => { component: string; variant?: string; state?: string; props?: Record<string, string> }[]) {
  let route = '/', title = '', saved = '', source = 'revision-one'
  let bridge: ReturnType<typeof createRuntimeBridge>
  const ports = {
    project: 'notebook-checkout', source: 'revision-one', seed: { title: '' }, now: 1791745200000,
    route: () => route,
    assertSource: async () => { if (source !== 'revision-one') throw Error('Source changed') },
    reset: async () => { route = '/'; title = ''; saved = '' },
    settle: async () => {},
    fields: () => [{ label: 'Title', value: title }],
    view: () => saved,
    interact: async (gesture: { kind: string; value?: string }) => {
      if (gesture.kind === 'input') title = gesture.value!
      else if (gesture.kind === 'save') {
        await bridge.operation('mutation', 'notes:save', { title }, async () => {
          if (!title.trim()) throw Error('Title required')
          saved = title; return { title }
        }).catch(() => {})
        if (saved) route = '/saved'
      } else route = '/'
    },
  }
  bridge = createRuntimeBridge({ ...ports, ...(components ? { components } : {}) })
  return { bridge, ports, drift: () => { source = 'revision-two' } }
}

test('records and replays actual handlers, arguments, results, captured inputs and return paths', async () => {
  const { bridge, ports } = notebook()
  for (const gesture of [{ kind: 'input', value: 'Retained note' }, { kind: 'save' }, { kind: 'back' }]) {
    bridge.record(gesture); await ports.interact(gesture); await bridge.flush()
  }
  const tape = await bridge.recording()
  expect(tape.steps[1]).toMatchObject({ route: '/saved', fields: [{ label: 'Title', value: 'Retained note' }], operations: [{ name: 'notes:save', args: { title: 'Retained note' }, result: { title: 'Retained note' } }] })
  expect(tape.steps[2].route).toBe('/')
  expect(await bridge.replay(tape)).toEqual({ verified: 3 })
  expect(await bridge.recording()).toEqual(tape)
})

test('records failures and refuses changed revisions, projects and divergent results', async () => {
  const { bridge, ports, drift } = notebook()
  bridge.record({ kind: 'save' }); await ports.interact({ kind: 'save' }); await bridge.flush()
  const tape = await bridge.recording()
  expect(tape.steps[0].operations[0].error).toBe('Title required')
  expect(await bridge.replay(tape)).toEqual({ verified: 1 })
  await expect(bridge.replay({ ...tape, project: 'another-project' })).rejects.toThrow('project or source')
  const changed = structuredClone(tape); changed.steps[0].route = '/saved'
  await expect(bridge.replay(changed)).rejects.toThrow('Replay diverged at step 1')
  drift(); await expect(bridge.replay(tape)).rejects.toThrow('Source changed')
})

test('an unfinished operation prevents exporting a misleading completed recording', async () => {
  const { bridge } = notebook()
  let release!: () => void
  bridge.record({ kind: 'save' })
  const operation = bridge.operation('mutation', 'notes:save', { title: 'Waiting' }, () => new Promise<void>((resolve) => { release = resolve }))
  let exported = false
  const tape = bridge.recording().then(() => { exported = true })
  await Promise.resolve(); expect(exported).toBe(false)
  release(); await operation; await tape; expect(exported).toBe(true)
})

test('a following click cannot overwrite the first captured state and typing coalesces before an action', async () => {
  const { bridge, ports } = notebook()
  bridge.record({ kind: 'input', value: 'First' }); await ports.interact({ kind: 'input', value: 'First' })
  bridge.record({ kind: 'input', value: 'Final' }); await ports.interact({ kind: 'input', value: 'Final' })
  const firstFlush = bridge.flush()
  bridge.record({ kind: 'save' }); await ports.interact({ kind: 'save' })
  await firstFlush; await bridge.flush()
  const tape = await bridge.recording()
  expect(tape.steps).toHaveLength(2)
  expect(tape.steps[0].fields[0].value).toBe('Final')
  expect(tape.steps[0].route).toBe('/')
  expect(await bridge.replay(tape)).toEqual({ verified: 2 })
})

test('beforeinput preserves the departing screen before the browser changes an input value', async () => {
  const { bridge, ports } = notebook()
  bridge.record({ kind: 'back' }); await ports.interact({ kind: 'back' })
  bridge.prepare({ tag: 'input', name: 'Title', count: 1, index: 0 })
  // Browsers update the input before dispatching input, so the old snapshot must already be sealed.
  await ports.interact({ kind: 'input', value: 'Changed by browser' })
  bridge.record({ kind: 'input', value: 'Changed by browser' }); await bridge.flush()
  const tape = await bridge.recording()
  expect(tape.steps[0].fields[0].value).toBe('')
  expect(await bridge.replay(tape)).toEqual({ verified: 2 })
})

test('records the components a step shows when the app marks them, and replays a tape recorded before it did', async () => {
  const plain = notebook()
  for (const gesture of [{ kind: 'input', value: 'Kept' }, { kind: 'save' }]) { plain.bridge.record(gesture); await plain.ports.interact(gesture); await plain.bridge.flush() }
  const older = await plain.bridge.recording()
  expect(older.steps.every((step) => !('components' in step))).toBe(true)

  // What a step shows follows the app: a large primary button while editing, disabled once saved.
  let route = () => '/'
  const { bridge: marked, ports } = notebook(() => [route() === '/saved' ? { component: 'platform:fluent-react-v9.button', variant: 'primary-filled', state: 'disabled' } : { component: 'platform:fluent-react-v9.button', variant: 'primary-filled', props: { size: 'large' } }])
  route = ports.route
  for (const gesture of [{ kind: 'input', value: 'Kept' }, { kind: 'save' }]) { marked.record(gesture); await ports.interact(gesture); await marked.flush() }
  const tape = await marked.recording()
  expect(tape.steps.map((step) => step.components)).toEqual([[{ component: 'platform:fluent-react-v9.button', variant: 'primary-filled', props: { size: 'large' } }], [{ component: 'platform:fluent-react-v9.button', variant: 'primary-filled', state: 'disabled' }]])
  // An older tape has no components to compare, so it still replays on an app that marks them.
  expect(await marked.replay(older)).toEqual({ verified: 2 })
  // A tape that has them diverges when a component's props change.
  const changed = structuredClone(tape); delete changed.steps[1].components![0].state
  await expect(marked.replay(JSON.parse(JSON.stringify(changed)))).rejects.toThrow('Replay diverged at step 2')
})
