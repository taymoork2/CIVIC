import { machineFromJSON } from 'xstate'

export const runMachine = machineFromJSON({
  id: 'run', initial: 'Starting', context: {},
  schemas: { events: Object.fromEntries(['RESTORE', 'READY', 'EXECUTE', 'COMPLETED', 'FAILED', 'STOP', 'CLOSED'].map(type => [type, {}])) },
  states: {
    Starting: { on: { RESTORE: { target: 'Restoring' }, READY: { target: 'Ready' }, FAILED: { target: 'Stopping' }, STOP: { target: 'Stopping' } } },
    Restoring: { on: { READY: { target: 'Ready' }, FAILED: { target: 'Stopping' }, STOP: { target: 'Stopping' } } },
    Ready: { on: { EXECUTE: { target: 'Executing', guard: { type: 'sameSource' } }, STOP: { target: 'Stopping' }, FAILED: { target: 'Stopping' } } },
    Executing: { on: { COMPLETED: { target: 'Ready', guard: { type: 'sameSource' } }, STOP: { target: 'Stopping' }, FAILED: { target: 'Stopping' } } },
    Stopping: { on: { CLOSED: { target: 'Stopped' } } },
    Stopped: { type: 'final' },
  },
}, { guards: { sameSource: ({ event }) => event.sameSource === true } })
