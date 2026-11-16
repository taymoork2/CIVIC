import { machineFromJSON } from 'xstate'

export const previewMachine = machineFromJSON({
  id: 'preview', initial: 'absent', context: {},
  schemas: { events: Object.fromEntries(['START', 'ATTACH', 'READY', 'LOST', 'STOP', 'CLOSED'].map((type) => [type, {}])) },
  states: {
    absent: { on: { START: { target: 'starting', guard: { type: 'owner' } }, ATTACH: { target: 'running', guard: { type: 'matching' } } } },
    starting: { on: { READY: { target: 'running' }, STOP: { target: 'stopping' }, LOST: { target: 'stale' } } },
    running: { on: { ATTACH: { target: 'running', guard: { type: 'matching' } }, STOP: { target: 'stopping' }, LOST: { target: 'stale' } } },
    stale: { on: { STOP: { target: 'stopping' } } },
    stopping: { on: { CLOSED: { target: 'stopped' } } },
    stopped: { type: 'final' },
  },
}, { guards: {
  owner: ({ event }) => event.owner === true,
  matching: ({ event }) => event.matching === true,
} })
