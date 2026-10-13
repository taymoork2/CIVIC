import { expect, test } from 'vitest'
import { createRuntimeBridge } from './runtime-bridge'

function notebook() {
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
  bridge = createRuntimeBridge(ports)
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
