import { execFileSync, spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
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
  // The shared package waits for a quiet machine itself; pass its wait options through.
  const wait = args.flatMap((arg, index) => arg === '--no-wait' || arg.startsWith('--wait-max=') ? [arg] : arg === '--wait-max' ? [arg, args[index + 1] ?? ''] : [])
  const own = args.filter((arg, index) => !wait.includes(arg) && args[index - 1] !== '--wait-max')
  if (own.some(arg => !['--dry-run', '--browser', '--post', '--no-post', '--fresh', '--all'].includes(arg))) throw new Error('Use --dry-run, --browser, --no-post, --post, --fresh, --all, --no-wait or --wait-max <minutes>')
  if (args.includes('--post') && (args.includes('--no-post') || args.includes('--dry-run') || process.env.NODE_TEST_CONTEXT)) throw new Error('Posting requires an explicit --post run outside tests and dry runs')
  process.chdir(root)
  process.env.CIVIC_SIGNOFF_BROWSER = args.includes('--browser') ? '1' : '0'
  const installed = spawnSync('git', ['show', 'main:.signoff.json'], { cwd: root, encoding: 'utf8' })
  if (installed.status !== 0) throw new Error('main has no .signoff.json, so there are no checks to run.')
  if (args.includes('--dry-run')) {
    console.log('Shared sign-off checks from main:')
    for (const check of loadConfig(installed.stdout).checks) console.log(`${check.name}: (${check.cwd}) ${check.argv.join(' ')}`)
    console.log(`gate: bin/civic check --config civic.check.json ${since().join(' ')}`)
    console.log(`release: bin/civic release --config civic.check.json ${since().join(' ')} (only when the base exists; exit 1 is reported)`)
    console.log(`browser (${args.includes('--browser') ? 'enabled' : 'off; use --browser'}): pnpm --dir demo/fluent-button/web install --frozen-lockfile; pnpm --dir demo/fluent-button/web run evidence`)
    console.log('All checks inherit bin/with-temp-root.mjs; posting is off unless --post is explicit.')
    return
  }
  if (!process.env.CIVIC_TEMP_ROOT) throw new Error('Run sign-off through bin/signoff')
  if (git('status', '--porcelain')) throw new Error('Commit your changes first: sign-off covers the committed version.')
  const sha = git('rev-parse', 'HEAD')
  const awake = process.platform === 'darwin' ? spawn('caffeinate', ['-ims', '-w', String(process.pid)], { stdio: 'ignore' }) : undefined
  awake?.on('error', error => { console.error(error.message); process.exitCode = 1 })
  try {
    // shortcut: runtime base/browser options require fresh checks, enable reuse when the package fingerprints them.
    await signoffMain(root, ['--fresh', '--all', ...wait])
    if (process.exitCode) return
    if (git('rev-parse', 'HEAD') !== sha || git('status', '--porcelain')) throw new Error('The checkout changed during checks; sign-off refused.')
    if (args.includes('--post')) {
      await signoffMain(root, ['--post', '--all', '--no-wait'])
      if (process.exitCode) return
      run('bin/civic', ['check', '--config', 'civic.check.json', '--post'])
      const pr = spawnSync('gh', ['pr', 'view', '--json', 'number,state', '--jq', 'select(.state == "OPEN") | .number'], { encoding: 'utf8' })
      if (pr.status === 0 && pr.stdout.trim() && since().length) run('bin/civic', ['check', '--config', 'civic.check.json', ...since(), '--comment', pr.stdout.trim()])
    }
  } finally { awake?.kill() }
}

if (import.meta.main) await main().catch(error => { console.error(error.message); process.exitCode = 1 })
