import { existsSync, writeFileSync } from 'node:fs'

export function createRuntime() {
  let count = 0
  return {
    seed: { count }, state: () => ({ count }),
    execute: (_kind, name, args) => {
      if (name === 'finish') {
        writeFileSync(args.barrier, 'blocked')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
      }
      if (name === 'hang' && !existsSync(args.barrier)) {
        writeFileSync(args.barrier, 'blocked')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
      }
      return { count: ++count }
    },
  }
}

