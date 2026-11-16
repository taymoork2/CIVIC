import { execFileSync, spawnSync, spawn } from 'node:child_process'
import { loadavg } from 'node:os'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { signoffMain } from '../tools/signoff/src/signoff.ts'
import { loadConfig } from '../tools/signoff/src/config.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const run = (command: string, args: string[], accepted = [0]) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (!accepted.includes(result.status ?? -1)) throw new Error(`${command} failed (${result.status ?? result.signal})`)
  return result.status
}

// Match the executable and its script argument, never shell snippets containing those words.
export function isSignoffProcess(command: string) {
  return /^(?:\S*\/)?(?:bash|node)\s+(?:--\s+)?(?:"(?:[^"]*\/)?(?:bin\/signoff|scripts\/signoff\.ts)"|'(?:[^']*\/)?(?:bin\/signoff|scripts\/signoff\.ts)'|(?:\S*\/)?(?:bin\/signoff|scripts\/signoff\.ts))(?:\s|$)/u.test(command)
    // Orca's landing gate runs its sign-off as `node -e import(".../scripts/signoff.ts")...`.
    || /^(?:\S*\/)?node\s+(?:-e|--eval)\s+['"]?import\(\s*["'][^"']*\/scripts\/signoff\.ts["']\s*\)/u.test(command)
}

export async function waitForQuiet() {
  process.title = 'civic-signoff-waiting'
  const limit = Number(process.env.CIVIC_SIGNOFF_LOAD ?? 10)
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('CIVIC_SIGNOFF_LOAD must be a positive number')
  const quiet = () => {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,args='], { encoding: 'utf8' }).trim().split('\n').map(line => {
      const [, pid, parent, command] = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/u) ?? []
      return { pid: Number(pid), parent: Number(parent), command: command?.trim() ?? '' }
    })
    const ancestors = new Set([process.pid])
    let parent = process.ppid
    while (parent && !ancestors.has(parent)) { ancestors.add(parent); parent = rows.find(row => row.pid === parent)?.parent ?? 0 }
    return loadavg()[0]! < limit && !rows.some(row => !ancestors.has(row.pid) && (isSignoffProcess(row.command) || (row.command === 'civic-signoff-reserving' && row.pid < process.pid)))
  }
  console.log('Waiting for a quiet machine and other sign-offs to finish.')
  while (true) {
    if (quiet()) {
      process.title = 'civic-signoff-reserving'
      await delay(30_000)
      if (quiet()) { process.title = `node ${fileURLToPath(import.meta.url)}`; return }
      process.title = 'civic-signoff-waiting'
    }
    await delay(10_000)
  }
}

function since() {
  const base = process.env.CIVIC_BASE ?? 'origin/main'
  return spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd: root }).status === 0 ? ['--since', base] : []
}

function step(name: string) {
  const base = since()
  if (name === 'gate') run('bin/civic', ['check', '--config', 'civic.check.json', ...base])
  else if (name === 'release' && base.length) {
    if (run('bin/civic', ['release', '--config', 'civic.check.json', ...base], [0, 1]) === 1) console.log('A library release needs its owners to decide a breaking change.')
  } else if (name === 'browser' && process.env.CIVIC_SIGNOFF_BROWSER === '1') {
    run('pnpm', ['--dir', 'demo/fluent-button/web', 'install', '--frozen-lockfile'])
    run('pnpm', ['--dir', 'demo/fluent-button/web', 'run', 'evidence'])
  } else if (!['release', 'browser'].includes(name)) throw new Error('Unknown sign-off step')
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--step') {
    if (!process.env.CIVIC_TEMP_ROOT) throw new Error('Run checks through bin/with-temp-root.mjs')
    step(args[1] ?? '')
    return
  }
  if (args.some(arg => !['--dry-run', '--browser', '--post', '--no-post', '--fresh', '--all'].includes(arg))) throw new Error('Use --dry-run, --browser, --no-post, --post, --fresh or --all')
  if (args.includes('--post') && (args.includes('--no-post') || args.includes('--dry-run') || process.env.NODE_TEST_CONTEXT)) throw new Error('Posting requires an explicit --post run outside tests and dry runs')
  process.chdir(root)
  process.env.CIVIC_SIGNOFF_BROWSER = args.includes('--browser') ? '1' : '0'
  const installed = spawnSync('git', ['show', 'main:.signoff.json'], { cwd: root, encoding: 'utf8' })
  if (args.includes('--dry-run')) {
    console.log(installed.status === 0 ? 'Shared sign-off checks from main:' : 'Before landing: existing sign-off steps; after landing: shared runner.')
    for (const check of loadConfig(installed.status === 0 ? installed.stdout : readFileSync('.signoff.json', 'utf8')).checks) console.log(`${check.name}: (${check.cwd}) ${check.argv.join(' ')}`)
    console.log(`gate: bin/civic check --config civic.check.json ${since().join(' ')}`)
    console.log(`release: bin/civic release --config civic.check.json ${since().join(' ')} (only when the base exists; exit 1 is reported)`)
    console.log(`browser (${args.includes('--browser') ? 'enabled' : 'off; use --browser'}): pnpm --dir demo/fluent-button/web install --frozen-lockfile; pnpm --dir demo/fluent-button/web run evidence`)
    console.log('All checks inherit bin/with-temp-root.mjs; posting is off unless --post is explicit.')
    return
  }
  if (!process.env.CIVIC_TEMP_ROOT) throw new Error('Run sign-off through bin/signoff')
  if (git('status', '--porcelain')) throw new Error('Commit your changes first: sign-off covers the committed version.')
  const sha = git('rev-parse', 'HEAD')
  await waitForQuiet()
  const awake = process.platform === 'darwin' ? spawn('caffeinate', ['-ims', '-w', String(process.pid)], { stdio: 'ignore' }) : undefined
  awake?.on('error', error => { console.error(error.message); process.exitCode = 1 })
  try {
    if (installed.status !== 0) {
      process.env.CIVIC_SIGNOFF_REPO_ROOT = root
      run('bash', ['tools/signoff/civic-legacy.sh', ...args.filter(arg => !['--fresh', '--all'].includes(arg))])
      return
    }
    // shortcut: runtime base/browser options require fresh checks, enable reuse when the package fingerprints them.
    await signoffMain(root, ['--fresh', '--all'])
    if (process.exitCode) return
    if (git('rev-parse', 'HEAD') !== sha || git('status', '--porcelain')) throw new Error('The checkout changed during checks; sign-off refused.')
    if (args.includes('--post')) {
      await signoffMain(root, ['--post', '--all'])
      if (process.exitCode) return
      run('bin/civic', ['check', '--config', 'civic.check.json', '--post'])
      const pr = spawnSync('gh', ['pr', 'view', '--json', 'number,state', '--jq', 'select(.state == "OPEN") | .number'], { encoding: 'utf8' })
      if (pr.status === 0 && pr.stdout.trim() && since().length) run('bin/civic', ['check', '--config', 'civic.check.json', ...since(), '--comment', pr.stdout.trim()])
    }
  } finally { awake?.kill() }
}

if (import.meta.main) await main().catch(error => { console.error(error.message); process.exitCode = 1 })
