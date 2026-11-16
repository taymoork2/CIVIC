import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { Effect } from 'effect'
import { serviceRegistration } from './service-registration.mjs'

const temporary = () => mkdtemp(path.join(tmpdir(), 'civic-presence-'))
for (const stale of [false, true]) test(`two real hosts racing for one store elect and authenticate one listener (stale=${stale})`, async () => {
  const store = await temporary()
  if (stale) {
    const seed = `import {serviceRegistration} from ${JSON.stringify(new URL('service-registration.mjs', import.meta.url).href)};await serviceRegistration(process.argv[1],'race');process.stdout.write('ready');process.stdin.resume()`
    const child = spawn(process.execPath, ['--input-type=module', '-e', seed, store], { stdio: ['pipe', 'pipe', 'inherit'] })
    await once(child.stdout, 'data')
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' })
  }
  const source = `import {Effect} from 'effect';import {managedHost} from ${JSON.stringify(new URL('app-server.mjs', import.meta.url).href)};Effect.runPromise(managedHost({store:process.argv[1],build:'race',viewer:async(listener,presence)=>{const origin='http://127.0.0.1:'+listener.address().port;process.send({ticket:await presence.issue(origin)});process.stdout.write('owner '+listener.address().port+'\\n');return {handle:(_req,res)=>res.end('ready'),close:()=>Promise.resolve()}}})).then(owner=>{process.stdout.write('adopted '+new URL(owner.endpoint).port+'\\n');process.disconnect()});`
  const children = Array.from({ length: 2 }, () => spawn(process.execPath, ['--input-type=module', '-e', source, store], { cwd: import.meta.dirname, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }))
  const chunks = []
  const tickets = []
  const capture = chunk => { chunks.push(chunk) }
  const ticket = message => { tickets.push(message.ticket) }
  for (const child of children) {
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    child.on('message', ticket)
  }
  try {
    const replies = await Promise.all(children.map(async child => { const [data] = await once(child.stdout, 'data'); return String(data).trim().split(' ') }))
    assert.deepEqual(replies.map(reply => reply[0]).toSorted(), ['adopted', 'owner'])
    assert.equal(replies[0][1], replies[1][1])
    const owner = JSON.parse(await readFile(path.join(store, '.review-data/service/registration.json'), 'utf8'))
    const output = chunks.join('')
    assert.ok(!output.includes(owner.capability))
    assert.ok(!output.includes('Bearer '))
    assert.equal(tickets.length, 1)
    assert.ok(!output.includes(tickets[0]))
    assert.ok(!owner.endpoint.includes(tickets[0]) && !owner.endpoint.includes(owner.capability))
  } finally {
    await Promise.all(children.map(async child => { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited } }))
  }
})
test('aliases adopt one owner; live incompatible and incomplete ownership fail closed', async () => {
  const store = await temporary()
  const owner = await serviceRegistration(store, 'test')
  await owner.publish('http://127.0.0.1:12345')
  const alias = `${store}-alias`
  await symlink(store, alias)
  try {
    const adopted = await serviceRegistration(alias, 'test')
    assert.equal(adopted.adopted, true)
    assert.equal(adopted.owner.nonce, owner.owner.nonce)
    const registration = await stat(path.join(store, '.review-data/service/registration.json'))
    assert.equal(registration.mode % 512, 0o600)
    await Promise.all([['', 0o700], ['owner.lock', 0o700], ['owner.lock/owner.json', 0o600]].map(async ([file, mode]) => {
      const info = await stat(path.join(store, '.review-data/service', file))
      assert.equal(info.mode % 512, mode)
    }))
    await assert.rejects(serviceRegistration(store, 'other'), /incompatible/u)
  } finally { await owner.close() }
})

test('positive dead-process evidence recovers stale ownership; a foreign listener is never adopted or killed', async () => {
  const store = await temporary()
  const source = `import {serviceRegistration} from ${JSON.stringify(new URL('service-registration.mjs', import.meta.url).href)}; const r=await serviceRegistration(process.argv[1],'test');await r.publish('http://127.0.0.1:12345');process.stdout.write('ready');process.stdin.resume()`
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, store], { stdio: ['pipe', 'pipe', 'inherit'] })
  await once(child.stdout, 'data')
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited
  const recovered = await serviceRegistration(store, 'test')
  assert.equal(recovered.adopted, false)
  await recovered.close()
  const foreign = createServer((_req, res) => res.end('foreign'))
  const listening = once(foreign, 'listening'); foreign.listen(0, '127.0.0.1'); await listening
  try {
    const before = foreign.address()
    const owner = await serviceRegistration(store, 'test')
    await owner.publish(`http://127.0.0.1:${before.port}`)
    const { managedHost } = await import('./app-server.mjs')
    await assert.rejects(Effect.runPromise(managedHost({ store, build: 'test', viewer: () => { throw Error('must not start') } })))
    const response = await fetch(`http://127.0.0.1:${before.port}`)
    assert.equal(await response.text(), 'foreign')
    await owner.close()
  } finally { foreign.closeAllConnections(); foreign.close() }
  const another = await serviceRegistration(store, 'test')
  const file = path.join(store, '.review-data/service/owner.lock/owner.json')
  await writeFile(file, '{}', { mode: 0o600 })
  await assert.rejects(serviceRegistration(store, 'test'))
  await writeFile(file, JSON.stringify(another.owner), { mode: 0o600 })
  await another.close()
})
