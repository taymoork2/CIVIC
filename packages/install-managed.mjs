import assert from 'node:assert/strict'
import { fork, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import nodePath from 'node:path'
import { pathToFileURL } from 'node:url'

export async function checkManagedInstall(app, installed) {
  const require = createRequire(nodePath.join(installed, 'package.json'))
  const { Effect, Schedule } = await import(pathToFileURL(require.resolve('effect')).href)
  const { WebSocket } = await import(pathToFileURL(require.resolve('ws')).href)
  const { moduleReviewAdapter } = await import(pathToFileURL(nodePath.join(installed, 'server/module-adapter.mjs')).href)
  const project = nodePath.join(app, 'managed-pantry'), store = nodePath.join(app, 'managed-store')
  await cp(nodePath.join(installed, 'examples/pantry'), project, { recursive: true })
  await cp(nodePath.join(installed, 'server/check-fixtures/interrupted-runtime.mjs'), nodePath.join(project, 'server/civic-runtime.js'))
  await mkdir(store)
  const sentinel = nodePath.join(store, 'unrelated.json')
  await writeFile(sentinel, '{"keep":"unchanged"}\n')
  const entry = nodePath.join(app, 'managed-consumer.mjs')
  await writeFile(entry, `import { startManagedCanvas } from '@civic/canvas/app-server';
await startManagedCanvas({ store: process.argv[2], project: { manifest: process.argv[3] }, build: 'installed-check', ready: owner => process.send(owner) });
process.disconnect();\n`)
  const children = [], sockets = []
  const launch = async () => {
    const child = fork(entry, [store, nodePath.join(project, 'civic.project.json')], { cwd: app, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    children.push(child)
    const exited = once(child, 'exit')
    const owner = await Promise.race([once(child, 'message').then(([value]) => value), exited.then(value => { throw Error(`Installed host exited before ready: ${value}`) })])
    assert.equal(owner.pid, child.pid)
    return { child, owner, exited }
  }
  const wait = async predicate => {
    const settled = await Effect.runPromise(Effect.promise(async () => Boolean(await predicate())).pipe(
      Effect.repeat({ schedule: Schedule.spaced('20 millis'), until: done => done }),
      Effect.timeoutOption('20 seconds'),
    ))
    if (settled._tag === 'None') assert.fail('Installed lifecycle boundary did not settle')
  }
  const browser = await moduleReviewAdapter.launchFixtureBrowser()
  try {
    const connect = async owner => {
      const desktop = new WebSocket(owner.endpoint.replace('http:', 'ws:') + '/api/civic/control', ['civic-control'], { headers: { authorization: `Bearer ${owner.capability}` } })
      sockets.push(desktop)
      await once(desktop, 'open')
      const tab = await browser.newPage()
      const attached = tab.waitForEvent('websocket', { predicate: socket => socket.url().endsWith('/api/civic/control') })
      await tab.goto(owner.endpoint + '/review')
      await attached
      const indexResponse = await tab.request.get(owner.endpoint + '/api/review/index')
      const index = await indexResponse.json()
      assert.equal(index.managedPresence, true)
      const operation = async input => {
        const response = await tab.request.post(owner.endpoint + '/api/review/runtime', { data: input, headers: { origin: owner.endpoint, 'x-rehearsal-project': index.project.key } })
        const result = await response.json()
        assert.equal(response.status(), 200, JSON.stringify(result))
        return result
      }
      return { desktop, tab, operation }
    }
    const first = await launch(), clients = await connect(first.owner)
    const run = await clients.operation({ action: 'start', scenario: 'pantry.shelf', persona: 'stocked', role: 'cook', condition: 'normal' })
    const command = { action: 'mutation', run: run.id, name: 'increment', intent: 'complete-0001' }
    assert.deepEqual(await clients.operation(command), { count: 1 })
    const files = await readdir(store, { recursive: true })
    const journals = files.filter(file => file.endsWith(`/runtime/${run.id}.json`))
    assert.equal(journals.length, 1)
    const journal = nodePath.join(store, journals[0]), barrier = nodePath.join(store, 'blocked')
    const pending = clients.operation({ action: 'mutation', run: run.id, name: 'hang', intent: 'unfinished-0001', args: { barrier } }).catch(() => null)
    await wait(() => stat(barrier).then(() => true).catch(() => false))
    const interrupted = JSON.parse(await readFile(journal, 'utf8'))
    assert.deepEqual(interrupted.journal.map(row => row.complete), [true, false])
    const registration = nodePath.join(store, '.review-data/service/registration.json')
    const stale = await readFile(registration, 'utf8')
    first.child.kill('SIGKILL')
    assert.deepEqual(await first.exited, [null, 'SIGKILL'])
    await pending
    assert.throws(() => process.kill(first.owner.pid, 0), { code: 'ESRCH' })
    assert.equal(await readFile(registration, 'utf8'), stale)
    await clients.tab.close()
    const second = await launch(), replacement = await connect(second.owner)
    assert.notEqual(second.owner.nonce, first.owner.nonce)
    assert.equal(JSON.parse(await readFile(registration, 'utf8')).nonce, second.owner.nonce)
    await replacement.operation({ action: 'resume', run: run.id })
    assert.deepEqual(await replacement.operation({ action: 'state', run: run.id }), { count: 1 })
    assert.deepEqual(await replacement.operation(command), { count: 1 })
    assert.equal(JSON.parse(await readFile(journal, 'utf8')).journal.length, 1)
    await replacement.operation({ action: 'close', run: run.id })
    const saved = JSON.parse(await readFile(journal, 'utf8'))
    saved.journal[0].result = { count: 99 }
    const mismatched = JSON.stringify(saved)
    await writeFile(journal, mismatched)
    const refused = await replacement.tab.request.post(second.owner.endpoint + '/api/review/runtime', { data: { action: 'resume', run: run.id }, headers: { origin: second.owner.endpoint } })
    assert.equal(refused.status(), 409)
    assert.match(JSON.stringify(await refused.json()), /effects differ/u)
    assert.equal(await readFile(journal, 'utf8'), mismatched)
    assert.equal(await readFile(sentinel, 'utf8'), '{"keep":"unchanged"}\n')
    const fresh = await replacement.operation({ action: 'start', scenario: 'pantry.shelf', persona: 'empty', role: 'cook', condition: 'normal' })
    assert.deepEqual(await replacement.operation({ action: 'state', run: fresh.id }), { count: 0 })
    replacement.desktop.close()
    await once(replacement.desktop, 'close')
    const reopened = await replacement.tab.request.get(second.owner.endpoint + '/api/review/index')
    assert.equal(reopened.status(), 200)
    assert.equal(second.child.exitCode, null)
    await replacement.tab.close()
    await wait(() => second.child.exitCode !== null)
    assert.deepEqual(await second.exited, [0, null])
    await Promise.all([registration, nodePath.join(store, '.review-data/service/owner.lock')].map(file => assert.rejects(stat(file), { code: 'ENOENT' })))
    const processes = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
    assert.ok(!processes.split('\n').some(line => line.includes(app)), 'consumer left a process behind')
    console.log('Installed managed host: browser and bearer client, interrupted journal recovery, mismatch refusal, last-client exit and ownership cleanup passed.')
  } finally {
    for (const socket of sockets) socket.terminate()
    await browser.close()
    await Promise.all(children.values().filter(child => child.exitCode === null && child.signalCode === null).map(child => {
      const exited = once(child, 'exit')
      child.kill('SIGKILL')
      return exited
    }))
  }
}
