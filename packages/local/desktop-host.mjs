import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Effect, Schedule } from 'effect'
import { WebSocket } from 'ws'
import { repo, store } from './store.mjs'

const git = args => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 32 * 1024 * 1024 })
export const branch = execFileSync('git', ['-C', repo, 'branch', '--show-current'], { encoding: 'utf8' }).trim() || 'Detached checkout'
export const profile = path.join(store, 'desktop', createHash('sha256').update(repo).digest('hex').slice(0, 16))

function socketClosed(socket) {
  return Effect.callback(resume => {
    const closed = () => resume(Effect.void)
    socket.once('close', closed)
    if (socket.readyState === WebSocket.CLOSED) closed()
    return Effect.sync(() => socket.removeListener('close', closed))
  })
}

export const desktopHost = Effect.gen(function* () {
  yield* Effect.tryPromise(() => mkdir(store, { recursive: true, mode: 0o700 }))
  const sources = ['packages/canvas', 'packages/local', 'packages/shell', 'packages/vite-connector', 'packages/pnpm-lock.yaml']
  const hash = createHash('sha256').update(repo).update(git(['rev-parse', 'HEAD'])).update(git(['diff', 'HEAD', '--', ...sources]))
  for (const file of git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...sources]).toString().split('\0').filter(Boolean)) hash.update(file).update(readFileSync(path.join(repo, file)))
  const build = hash.digest('hex')
  const owner = yield* Effect.timeout(Effect.tryPromise(async () => {
    const log = await open(path.join(store, 'managed-host.log'), 'a', 0o600)
    try {
      // eslint-disable-next-line promise/avoid-new -- child IPC is a callback boundary.
      return await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(new URL('managed-host.mjs', import.meta.url))], {
          detached: true, stdio: ['ignore', log.fd, log.fd, 'ipc'],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CIVIC_HOST_BUILD: build },
        })
        child.once('error', reject)
        child.once('message', resolve)
        child.once('exit', () => reject(Error('CIVIC could not start. See managed-host.log in its store.')))
        child.unref()
      })
    } finally { await log.close() }
  }), '60 seconds')
  // eslint-disable-next-line no-use-before-define -- the connection helper is a hoisted function.
  const socket = yield* desktopConnection(owner)
  yield* Effect.forkChild(Effect.andThen(socketClosed(socket), Effect.forever(Effect.scoped(Effect.gen(function* () {
    // eslint-disable-next-line no-use-before-define -- the connection helper is a hoisted function.
    const next = yield* desktopConnection(owner)
    yield* socketClosed(next)
  })))))
  return owner.endpoint
})

export function desktopConnection(owner) {
  return Effect.acquireRelease(
    Effect.timeout(Effect.retry(Effect.timeout(Effect.callback(resume => {
      const socket = new WebSocket(owner.endpoint.replace('http:', 'ws:') + '/api/civic/control', ['civic-control'], { headers: { authorization: `Bearer ${owner.capability}` } })
      socket.once('open', () => resume(Effect.succeed(socket)))
      socket.once('error', error => resume(Effect.fail(error)))
      return Effect.sync(() => { if (socket.readyState !== WebSocket.OPEN) socket.terminate() })
    }), '2 seconds'), { schedule: Schedule.spaced(100) }), '60 seconds'),
    socket => Effect.sync(() => socket.terminate()),
  )
}
