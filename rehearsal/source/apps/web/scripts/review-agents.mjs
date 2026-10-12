import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { createInterface } from 'node:readline'

const sessionId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const invalid = (message) => { throw Object.assign(Error(message), { status: 400 }) }

// Destinations are operator-owned files, never browser-supplied commands or hosts.
export async function agentDestinations(dataDir) {
  let rows
  try { rows = JSON.parse(await readFile(join(dataDir, 'agents.json'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return []; throw Object.assign(Error('Repair agents.json before sending a review.'), { status: 503 }) }
  if (!Array.isArray(rows) || rows.length > 30) invalid('agents.json must contain at most 30 destinations.')
  const ids = new Set()
  return rows.map((row) => {
    if (!row || !/^[a-z0-9-]{1,60}$/.test(row.id) || ids.has(row.id) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 120 || !['codex', 'claude'].includes(row.provider) || !sessionId.test(row.sessionId) || typeof row.cwd !== 'string' || !isAbsolute(row.cwd) || row.cwd.includes('\n') || row.cwd.includes('\0')) invalid('Invalid agent destination identity, provider, session or directory.')
    if (row.sshHost !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9@._-]{0,200}$/.test(row.sshHost)) invalid('Use an SSH config host or user@host in agents.json.')
    if (row.executable !== undefined && (typeof row.executable !== 'string' || !isAbsolute(row.executable) || /[\n\0]/.test(row.executable))) invalid('Agent executable must be an absolute path.')
    if (row.socket !== undefined && (row.provider !== 'codex' || typeof row.socket !== 'string' || !isAbsolute(row.socket) || /[\n\0]/.test(row.socket))) invalid('Codex socket must be an absolute path.')
    ids.add(row.id)
    return { id: row.id, label: row.label.trim(), provider: row.provider, sessionId: row.sessionId, cwd: row.cwd, ...(row.sshHost ? { sshHost: row.sshHost } : {}), ...(row.executable ? { executable: row.executable } : {}), ...(row.socket ? { socket: row.socket } : {}) }
  })
}

export const publicDestination = ({ id, label, provider, sessionId, cwd, sshHost }) => ({ id, label, provider, sessionId, cwd, host: sshHost ?? 'This Mac' })
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'"
export function agentCommand(target) {
  const args = target.provider === 'codex'
    ? ['app-server', 'proxy', ...(target.socket ? ['--sock', target.socket] : [])]
    : ['-p', '--resume', target.sessionId, '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompts', 'none']
  const executable = target.executable ?? target.provider
  return target.sshHost
    ? { executable: 'ssh', args: ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '--', target.sshHost, `cd ${quote(target.cwd)} && exec ${[executable, ...args].map(quote).join(' ')}`] }
    : { executable, args, cwd: target.cwd }
}

/** The receipt is delivery evidence, never evidence that a requested fix is correct. */
export async function dispatchReview(target, { brief, png }, notify, { spawnProcess = spawn, timeoutMs = 1_200_000, rpcTimeoutMs = 15_000 } = {}) {
  const command = agentCommand(target)
  const child = spawnProcess(command.executable, command.args, { cwd: command.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false })
  let sent = false, accepted = false, settled = false, sequence = 0, turnId, earlyCompletion
  const waiting = new Map()
  const messages = new Map()
  let updates = Promise.resolve()
  const update = (value) => { updates = updates.then(() => notify(value)); void updates.catch(() => {}); return updates }
  const write = (value) => child.stdin.write(JSON.stringify(value) + '\n')
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { waiting.delete(id); reject(Error(`No acknowledgement for ${method}.`)) }, rpcTimeoutMs)
    waiting.set(id, { resolve, reject, timer })
    write({ id, method, params })
  })
  let finish
  const done = new Promise((resolve) => { finish = (status, detail, extra = {}) => {
    if (settled) return
    settled = true; clearTimeout(timer)
    for (const pending of waiting.values()) { clearTimeout(pending.timer); pending.reject(Error(detail)) }
    waiting.clear(); child.kill()
    update({ status, detail, ...extra }).then(resolve, resolve)
  } })
  const timer = setTimeout(() => finish(sent ? 'unknown' : 'failed', 'Bridge timed out. Check the harness before sending again.'), timeoutMs)
  child.on('error', () => finish(sent ? 'unknown' : 'failed', 'Could not connect to the configured harness. Check the executable, SSH host and server.'))
  child.on('close', (code) => { if (!settled) finish(sent ? 'unknown' : 'failed', `Harness disconnected (${code ?? 'signal'}). Check its session before resending.`) })
  child.stdin.on('error', () => finish(sent ? 'unknown' : 'failed', 'Harness input closed. Check its session before resending.'))
  child.stderr.resume() // CLI diagnostics may contain account details; retain only protocol receipts.
  let buffered = 0
  child.stdout.on('data', (chunk) => {
    buffered += chunk.length
    if (buffered > 16_000_000) finish(sent ? 'unknown' : 'failed', 'Harness response exceeded the bridge limit.')
    const newline = chunk.lastIndexOf(10)
    if (newline !== -1) buffered = chunk.length - newline - 1
  })
  const completeCodex = (turn) => {
    if (!turn || typeof turn.id !== 'string') { finish('unknown', 'Codex returned an invalid completion receipt.'); return }
    if (turn.id !== turnId) return
    finish(turn.status === 'completed' ? 'completed' : 'failed', turn.status === 'completed' ? 'Codex finished its turn. Verify the correction before resolving.' : `Codex turn ${turn.status}. Inspect the harness.`, { turnId, result: [...messages.values()].filter((message) => message.turnId === turnId).map((message) => message.text).join('\n\n').slice(-8000) })
  }
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    if (settled) return
    let event
    try { event = JSON.parse(line) } catch { finish(sent ? 'unknown' : 'failed', 'Harness returned an unsupported protocol response.'); return }
    if (!event || typeof event !== 'object' || Array.isArray(event)) { finish(sent ? 'unknown' : 'failed', 'Harness returned an invalid protocol message.'); return }
    if (target.provider === 'claude') {
      if (event.type === 'system' && event.subtype === 'init') {
        if (event.session_id !== target.sessionId) { finish('unknown', 'Claude returned a different session. Inspect the harness before resending.'); return }
        accepted = true; void update({ status: 'accepted', sessionId: event.session_id, detail: 'Claude resumed this session. Permission prompts are denied in this unattended run.' })
      }
      if (event.type === 'result') {
        if (event.session_id !== target.sessionId || !accepted) finish('unknown', 'Claude did not acknowledge the expected session.')
        else finish(event.is_error ? 'failed' : 'completed', event.is_error ? 'Claude ended with an error; inspect the session.' : 'Claude finished its turn. Verify the correction before resolving.', { result: String(event.result ?? '').slice(-4000) })
      }
      return
    }
    if (event.id !== undefined && !event.method) {
      const pending = waiting.get(event.id)
      if (pending) { clearTimeout(pending.timer); waiting.delete(event.id); event.error ? pending.reject(Error(event.error.message ?? 'Harness refused request.')) : pending.resolve(event.result) }
    }
    if (event.method && event.id !== undefined) {
      if (event.params?.threadId && event.params.threadId !== target.sessionId) return
      // Rehearsal delivers work but never grants agent permissions or answers product questions.
      if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(event.method)) write({ id: event.id, result: { decision: 'decline' } })
      else write({ id: event.id, error: { code: -32601, message: 'Rehearsal does not handle approvals or interactive tools. Use the harness.' } })
      if (event.params?.threadId === target.sessionId) void update({ status: accepted ? 'accepted' : 'pending', detail: 'Agent requested interaction. Rehearsal did not grant it; inspect the harness.' })
    }
    if (event.params?.threadId !== target.sessionId) return
    if (event.method === 'item/completed' && event.params.item?.type === 'agentMessage' && typeof event.params.item.text === 'string') {
      if (messages.size >= 100) messages.delete(messages.keys().next().value)
      messages.set(event.params.item.id, { turnId: event.params.turnId, text: event.params.item.text.slice(-8000) })
      if (accepted && event.params.turnId === turnId) void update({ status: 'accepted', result: [...messages.values()].filter((message) => message.turnId === turnId).map((message) => message.text).join('\n\n').slice(-8000) })
    }
    if (event.method === 'turn/completed') {
      if (!turnId) earlyCompletion = event.params.turn
      else completeCodex(event.params.turn)
    }
  })
  try {
    if (target.provider === 'claude') {
      sent = true
      child.stdin.end(JSON.stringify({ type: 'user', session_id: target.sessionId, message: { role: 'user', content: [{ type: 'text', text: brief }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } }] } }) + '\n')
    } else {
      await request('initialize', { clientInfo: { name: 'rehearsal', version: '1.0.0' } })
      write({ method: 'initialized' })
      const { thread } = await request('thread/read', { threadId: target.sessionId, includeTurns: false })
      if (thread.id !== target.sessionId || thread.cwd !== target.cwd) throw Error('Thread directory does not match the configured destination.')
      if (!['idle', 'notLoaded'].includes(thread.status?.type)) throw Error('Thread is busy or unavailable. Wait for it to become idle.')
      const resumed = await request('thread/resume', { threadId: target.sessionId })
      if (resumed.thread.id !== target.sessionId || resumed.thread.cwd !== target.cwd || resumed.thread.status?.type !== 'idle') throw Error('Resumed thread is not idle in the expected directory.')
      // shortcut: idle checks are not atomic with turn/start; coordinate session ownership until the harness supports compare-and-start.
      sent = true
      const { turn } = await request('turn/start', { threadId: target.sessionId, input: [{ type: 'text', text: brief }, { type: 'image', url: `data:image/png;base64,${png.toString('base64')}` }] })
      if (!turn?.id) throw Error('Codex returned no turn receipt.')
      turnId = turn.id; accepted = true
      await update({ status: 'accepted', turnId, sessionId: target.sessionId, detail: 'Codex accepted the review. Existing model and permission settings were preserved.' })
      if (earlyCompletion) completeCodex(earlyCompletion)
      if (turn.status !== 'inProgress') completeCodex(turn)
    }
  } catch (error) { finish(sent ? 'unknown' : 'failed', error.message) }
  await done
}
