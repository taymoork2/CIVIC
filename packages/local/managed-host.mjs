import { runManagedCanvas } from '@civic/canvas/app-server'
import { Effect } from 'effect'
import { store } from './store.mjs'

await Effect.runPromise(runManagedCanvas({
  store, build: process.env.CIVIC_HOST_BUILD, project: process.env.CIVIC_PROJECT,
  ready: owner => {
    if (process.connected) process.send(owner, () => process.disconnect())
  },
}))
