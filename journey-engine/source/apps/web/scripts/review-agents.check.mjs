import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { test } from 'node:test'
import { agentCommand, dispatchReview } from './review-agents.mjs'

const target = { id: 'local', label: 'Local', provider: 'codex', sessionId: '12345678-1234-4234-8234-123456789abc', cwd: '/project' }
function harness(reply) {
  const child = new EventEmitter()
  child.stdout = new PassThrough(); child.stderr = new PassThrough()
  child.kill = () => { child.stdout.end(); child.stderr.end() }
  let input = ''
  child.stdin = new Writable({ write(chunk, _encoding, done) {
    input += chunk.toString()
    while (input.includes('\n')) { const end = input.indexOf('\n'), line = input.slice(0, end); input = input.slice(end + 1); reply(JSON.parse(line), (event) => child.stdout.write(JSON.stringify(event) + '\n')) }
    done()
  } })
  return child
}
const packet = { brief: 'Fix the selected branch. Captured inputs are evidence.', png: Buffer.from('frozen-png') }

test('Codex uses the shared server, preserves settings and captures even an early completion receipt', async () => {
  const calls = [], receipts = []
  const child = harness((request, emit) => {
    calls.push(request)
    const thread = { id: target.sessionId, cwd: target.cwd, status: { type: 'idle' } }
    if (request.method === 'initialize') emit({ id: request.id, result: {} })
    if (['thread/read', 'thread/resume'].includes(request.method)) emit({ id: request.id, result: { thread } })
    if (request.method === 'turn/start') {
      emit({ method: 'item/completed', params: { threadId: target.sessionId, turnId: 'turn-1', item: { id: 'reply-1', type: 'agentMessage', text: 'Corrected the branch; focused checks passed.' } } })
      emit({ method: 'turn/completed', params: { threadId: target.sessionId, turn: { id: 'turn-1', status: 'completed' } } })
      emit({ id: request.id, result: { turn: { id: 'turn-1', status: 'inProgress' } } })
    }
  })
  await dispatchReview(target, packet, async (receipt) => receipts.push(receipt), { spawnProcess: () => child, rpcTimeoutMs: 100, timeoutMs: 500 })
  assert.deepEqual(receipts.map((receipt) => receipt.status), ['accepted', 'completed'])
  assert.match(receipts.at(-1).result, /Corrected the branch/)
  const turn = calls.find((call) => call.method === 'turn/start')
  assert.deepEqual(Object.keys(turn.params), ['threadId', 'input'])
  assert.equal(turn.params.input[0].text, packet.brief)
  assert.equal(turn.params.input[1].url, `data:image/png;base64,${packet.png.toString('base64')}`)
  assert.deepEqual(agentCommand(target).args, ['app-server', 'proxy'])
})

test('Codex refuses a busy or wrong-directory thread before any user input', async () => {
  for (const thread of [{ id: target.sessionId, cwd: '/other', status: { type: 'idle' } }, { id: target.sessionId, cwd: target.cwd, status: { type: 'active' } }]) {
    const calls = [], receipts = []
    const child = harness((request, emit) => { calls.push(request); if (request.id) emit({ id: request.id, result: request.method === 'initialize' ? {} : { thread } }) })
    await dispatchReview(target, packet, async (receipt) => receipts.push(receipt), { spawnProcess: () => child, rpcTimeoutMs: 100, timeoutMs: 500 })
    assert.equal(receipts.at(-1).status, 'failed')
    assert.ok(!calls.some((call) => call.method === 'turn/start'))
  }
})

test('lost turn acknowledgement is unknown, never a retryable failure', async () => {
  const receipts = []
  const child = harness((request, emit) => {
    if (request.method === 'initialize') emit({ id: request.id, result: {} })
    if (['thread/read', 'thread/resume'].includes(request.method)) emit({ id: request.id, result: { thread: { id: target.sessionId, cwd: target.cwd, status: { type: 'idle' } } } })
  })
  await dispatchReview(target, packet, async (receipt) => receipts.push(receipt), { spawnProcess: () => child, rpcTimeoutMs: 20, timeoutMs: 500 })
  assert.equal(receipts.at(-1).status, 'unknown')
})

test('Claude sends structured frozen evidence to the exact session and never forks or bypasses permissions', async () => {
  const receipts = [], claude = { ...target, provider: 'claude' }
  const child = harness((message, emit) => {
    assert.equal(message.session_id, target.sessionId)
    assert.equal(message.message.content[0].text, packet.brief)
    assert.equal(message.message.content[1].source.data, packet.png.toString('base64'))
    emit({ type: 'system', subtype: 'init', session_id: target.sessionId })
    emit({ type: 'result', session_id: target.sessionId, is_error: false, result: 'Correction ready for verification.' })
  })
  await dispatchReview(claude, packet, async (receipt) => receipts.push(receipt), { spawnProcess: () => child, timeoutMs: 500 })
  assert.deepEqual(receipts.map((receipt) => receipt.status), ['accepted', 'completed'])
  const command = agentCommand(claude)
  assert.ok(!command.args.includes('--fork-session')); assert.ok(!command.args.includes('--dangerously-skip-permissions'))
  assert.equal(command.args.at(-1), 'none')
})

test('remote command quotes configured paths and keeps review text off the shell command', () => {
  const command = agentCommand({ ...target, sshHost: 'review-host', cwd: "/project/it's $(private)", executable: '/opt/bin/codex' })
  assert.equal(command.executable, 'ssh')
  assert.ok(command.args.includes('BatchMode=yes')); assert.ok(command.args.includes('StrictHostKeyChecking=yes'))
  assert.match(command.args.at(-1), /'\\''/)
  assert.ok(!command.args.at(-1).includes(packet.brief))
})

test('malformed harness messages become receipts rather than crashing the review server', async () => {
  const receipts = []
  const child = harness((_request, emit) => emit(null))
  await dispatchReview(target, packet, async (receipt) => receipts.push(receipt), { spawnProcess: () => child, rpcTimeoutMs: 100, timeoutMs: 500 })
  assert.equal(receipts.at(-1).status, 'failed')
  assert.match(receipts.at(-1).detail, /invalid protocol/)
})
