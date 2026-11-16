// Opt-in model-usage acceptance. Run with CIVIC_REAL_AGENT=codex node review/test/real-agent-loop.manual.mjs.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { appendFileSync, createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { loadavg } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const harness = process.env.CIVIC_REAL_AGENT
if (!harness) { console.log('Skipped: set CIVIC_REAL_AGENT=codex (spends model usage).'); process.exit(0) }
assert.equal(harness, 'codex', 'This runner supports codex only')
const civic = fileURLToPath(new URL('../../', import.meta.url))
if (!process.env.CIVIC_TEMP_ROOT) {
  const child = spawn(process.execPath, [join(civic, 'bin/with-temp-root.mjs'), process.execPath, fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, CIVIC_KEEP_TEMP: '1' } })
  process.exit((await once(child, 'exit'))[0] ?? 1)
}
const root = process.env.CIVIC_TEMP_ROOT
const evidence = join(root, 'evidence')
mkdirSync(evidence)
console.log(`Evidence: ${evidence}`)
const record = (file, value) => appendFileSync(join(evidence, file), JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n')
const deadline = Date.now() + 45 * 60_000
while (true) {
  const processes = execFileSync('ps', ['-axo', 'comm=,args='], { encoding: 'utf8' })
  const busy = processes.split('\n').some(line => /^\s*\S*(?:node|bash)\s/.test(line) && /(?:bin\/signoff|scripts\/signoff\.ts)(?:\s|$)/.test(line))
  const load = loadavg()[0]
  record('gate.jsonl', { load, signoff: busy })
  if (load < 10 && !busy) break
  if (Date.now() >= deadline) throw new Error('Machine remained busy for 45 minutes; no harness run started')
  await new Promise(resolve => setTimeout(resolve, 50_000))
}
const { readCheckout } = await import('../src/git.ts')
const { Store } = await import('../src/store.ts')
const { listRequests, getRequest, resolve: accept } = await import('../src/loop.ts')
const { createOverlayServer } = await import('../src/overlay/server.ts')
const { integrationConfig, serverEntry } = await import('../src/integrations.ts')
const repo = join(root, 'app')
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', civic, repo])
const example = 'packages/canvas/examples/notebook'
git('checkout', 'HEAD', '--', example)
const source = `${example}/src/screens.js`
writeFileSync(join(repo, 'AGENTS.md'), 'Edit only packages/canvas/examples/notebook/src/screens.js. Do not commit, stage, change git configuration, or resolve requests. Report the uncommitted fix without a preview; the owner will review it. Use only CIVIC MCP for review records.\n')
const checkout = readCheckout(repo)
const store = Store.forCheckout(checkout)
const context = () => ({ checkout: readCheckout(repo), store, identity: { type: 'person', handle: 'owner' } })
const servers = []
const listen = async server => {
  servers.push(server)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  assert.ok(![3012, 3013, 4317, 5733, 4417, 5734, 10448, 10449].includes(port))
  return `http://127.0.0.1:${port}`
}
try {
  const app = await listen(createServer((req, res) => {
    res.setHeader('content-type', req.url === '/screens.js' ? 'text/javascript' : 'text/html')
    res.end(req.url === '/screens.js' ? readFileSync(join(repo, source), 'utf8').replace("import './screens.css'", '') : `<html><body><main></main><script type="module">import {renderScreen} from '/screens.js';renderScreen(document.querySelector('main'),{screen:'demo.home'}, {begin(){}})</script></body></html>`)
  }))
  const overlay = await listen(createOverlayServer(context, undefined, { system: 'manual', id: 'real-agent-loop' }))
  const response = await fetch(`${overlay}/annotate`, { method: 'POST', headers: { origin: app, 'content-type': 'application/json' }, body: JSON.stringify({ comment: "Change the home screen heading from 'Notebook' to 'Nothing here yet'.", location: `${source}:6:1`, url: app, viewport: { width: 800, height: 600 }, rect: { x: 0, y: 0, width: 1, height: 1 }, html: '<html><body><h1>Notebook</h1></body></html>' }) })
  assert.equal(response.status, 201, await response.text())
  const request = listRequests(context())[0].request
  const snapshot = phase => { const current = getRequest(context(), request.id).request; record('states.jsonl', { phase, request: current }); return current }
  assert.equal(snapshot('owner-created').status, 'open')
  // Tee only protocol method/tool names, never harness config, credentials or arbitrary shell output.
  const wrapper = join(root, 'mcp-tee.mjs')
  const entry = serverEntry(civic)
  writeFileSync(wrapper, `import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {appendFileSync} from 'node:fs';
const child=spawn(${JSON.stringify(entry.command)},[],{stdio:['pipe','pipe','inherit']});const pending=new Map();const log=value=>appendFileSync(${JSON.stringify(join(evidence, 'mcp.jsonl'))},JSON.stringify({at:new Date().toISOString(),...value})+'\\n');
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.params?.name)pending.set(m.id,m.params.name);log({method:m.method,tool:m.params?.name});child.stdin.write(line+'\\n')}).on('close',()=>child.stdin.end());createInterface({input:child.stdout}).on('line',line=>{const m=JSON.parse(line);if(pending.has(m.id)){log({response:pending.get(m.id),isError:m.result?.isError??false,text:m.result?.content?.filter(c=>c.type==='text').map(c=>c.text)});pending.delete(m.id)}process.stdout.write(line+'\\n')});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill());`)
  const configured = JSON.parse(integrationConfig('codex', { command: process.execPath, args: [wrapper], env: { ...entry.env, CIVIC_AGENT: 'codex', CIVIC_FOR: 'owner', CIVIC_REPO: repo } })).mcpServers.civic
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--json', '-s', 'workspace-write', '-C', repo]
  for (const [key, value] of Object.entries(configured)) {
    if (key === 'env') for (const [name, setting] of Object.entries(value)) args.push('-c', `mcp_servers.civic.env.${name}=${JSON.stringify(setting)}`)
    else args.push('-c', `mcp_servers.civic.${key}=${JSON.stringify(value)}`)
  }
  args.push('Use the CIVIC tools to find and complete the open work request in this project. Follow AGENTS.md. Do not commit. Leave the result waiting for owner review.')
  const child = spawn('codex', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  child.stderr.pipe(createWriteStream(join(evidence, 'harness-stderr.log')))
  child.stdout.pipe(createWriteStream(join(evidence, 'harness-events.jsonl')))
  const timer = setTimeout(() => process.kill(-child.pid, 'SIGTERM'), 15 * 60_000)
  const poll = setInterval(() => snapshot('during-harness'), 2000)
  let code
  try { [code] = await once(child, 'exit') } finally { clearTimeout(timer); clearInterval(poll) }
  record('harness.jsonl', { harness, exitCode: code })
  const ready = snapshot('harness-finished')
  writeFileSync(join(evidence, 'source.diff'), git('diff', '--', source) + '\n')
  assert.equal(code, 0)
  assert.equal(ready.status, 'fix-ready')
  assert.ok(ready.history.some(row => row.status === 'claimed' && row.by === 'actor:agent.codex.owner'))
  assert.equal(ready.fixes.at(-1).by, 'actor:agent.codex.owner')
  assert.match(readFileSync(join(repo, source), 'utf8'), /'demo.home': 'Nothing here yet'/)
  assert.equal(git('rev-parse', 'HEAD'), checkout.head, 'Agent must not commit')
  accept(context(), [request.id])
  assert.equal(snapshot('owner-accepted').status, 'resolved')
  console.log('PASS: owner → MCP agent → uncommitted source fix → owner acceptance')
} finally {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
}
