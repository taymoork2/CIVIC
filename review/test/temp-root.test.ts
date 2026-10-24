import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

// bin/with-temp-root.mjs: every check runs in a temp folder of its own that is removed afterwards, because an
// Electron profile alone is 30-110 MB and 6,000 leftover folders once filled the disk.
const CIVIC = join(dirname(fileURLToPath(import.meta.url)), '../..')
const WRAPPER = join(CIVIC, 'bin/with-temp-root.mjs')
const made: string[] = []
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

/** A temp folder of its own for one test, standing in for the machine's, so the tests cannot see each other. */
function sandbox() {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'civic-temp-root-test-')))
  made.push(scratch)
  const wrap = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [WRAPPER, ...args], { env: { ...process.env, TMPDIR: scratch, CIVIC_TEMP_ROOT: '', CIVIC_KEEP_TEMP: '', ...env }, encoding: 'utf8' })
  const runs = () => readdirSync(scratch).filter((name) => name.startsWith('civic-run-'))
  return { scratch, wrap, runs }
}
const node = (code: string) => [process.execPath, '-e', code]

test('a command\'s temp folders are gone when it ends, and its exit code is kept', () => {
  const { scratch, wrap, runs } = sandbox()
  const result = wrap(node("require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'electron-profile-')); process.exit(3)"))
  assert.equal(result.status, 3)
  assert.deepEqual(runs(), [])
})

test('the command sees the folder as TMPDIR, and it is one the tool made', () => {
  const { scratch, wrap, runs } = sandbox()
  const result = wrap(node('console.log(process.env.TMPDIR + "|" + process.env.CIVIC_TEMP_ROOT)'))
  const [tmp, root] = result.stdout.trim().split('|')
  assert.equal(tmp, root)
  assert.match(root!, new RegExp(`^${scratch}/civic-run-[0-9a-f]{8}$`))
})

test('git inside the command does not sign, and settings already in the environment still apply', () => {
  const { wrap } = sandbox()
  const ask = "const {execFileSync}=require('child_process');const g=(k)=>execFileSync('git',['config','--get',k]).toString().trim();console.log([g('commit.gpgsign'),g('tag.gpgsign'),g('civic.test')].join(','))"
  const result = wrap(node(ask), { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'civic.test', GIT_CONFIG_VALUE_0: 'kept' })
  assert.equal(result.stdout.trim(), 'false,false,kept')
})

test('CIVIC_KEEP_TEMP keeps the folder and says where, and a later run leaves it alone', () => {
  const { scratch, wrap, runs } = sandbox()
  const kept = wrap(node("require('fs').writeFileSync(require('path').join(process.env.TMPDIR, 'evidence'), 'x')"), { CIVIC_KEEP_TEMP: '1' })
  assert.match(kept.stderr, /Kept the temp folder /)
  const [name] = runs()
  assert.ok(name && existsSync(join(scratch, name, 'evidence')))
  wrap(node('0'))
  assert.deepEqual(runs(), [name])
})

test('a run killed earlier is cleaned up, but only a dead run\'s own folder', () => {
  const { scratch, wrap, runs } = sandbox()
  const dead = spawnSync(process.execPath, ['-e', '0']).pid
  const folder = (name: string, mark?: object) => {
    mkdirSync(join(scratch, name))
    if (mark) writeFileSync(join(scratch, name, '.civic-temp-root'), JSON.stringify(mark))
    writeFileSync(join(scratch, name, 'file'), 'x')
  }
  folder('civic-run-aaaaaaaa', { pid: dead })
  folder('civic-run-bbbbbbbb', { pid: process.pid })
  folder('civic-run-cccccccc')
  folder('civic-run-dddddddd', { pid: dead, keep: true })
  mkdirSync(join(scratch, 'elsewhere'))
  writeFileSync(join(scratch, 'elsewhere/precious'), 'x')
  symlinkSync(join(scratch, 'elsewhere'), join(scratch, 'civic-run-eeeeeeee'))

  wrap(node('0'))
  assert.deepEqual(runs().sort(), ['civic-run-bbbbbbbb', 'civic-run-cccccccc', 'civic-run-dddddddd', 'civic-run-eeeeeeee'], 'a live maker, no marker, kept, and a link all stay')
  assert.ok(existsSync(join(scratch, 'elsewhere/precious')), 'a link is never followed')
})

test('a folder whose marker was removed is not deleted', () => {
  const { scratch, wrap, runs } = sandbox()
  const result = wrap(node("require('fs').rmSync(require('path').join(process.env.TMPDIR, '.civic-temp-root')); require('fs').writeFileSync(require('path').join(process.env.TMPDIR, 'mine'), 'x')"))
  assert.match(result.stderr, /Not removing .* it is not a folder this tool made/)
  assert.equal(runs().length, 1)
})

test('every package script that runs checks goes through the wrapper, and so does signoff', () => {
  const files = execFileSync('git', ['ls-files', '--', '*package.json'], { cwd: CIVIC, encoding: 'utf8' }).split('\n').filter(Boolean)
  const unwrapped: string[] = []
  let wrapped = 0
  for (const file of files) {
    const scripts = (JSON.parse(readFileSync(join(CIVIC, file), 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}
    for (const [name, command] of Object.entries(scripts)) {
      if (!/\bnode (--test|\S+\.check\.mjs)/.test(command)) continue
      if (command.includes('with-temp-root.mjs')) wrapped++
      else unwrapped.push(`${file}: ${name}`)
    }
  }
  assert.ok(wrapped >= 9, `found only ${wrapped} wrapped test scripts; the guard's pattern may have stopped matching`)
  assert.deepEqual(unwrapped, [], 'These scripts make temp folders that nothing removes. Start them with: node <path to>/bin/with-temp-root.mjs')
  assert.match(readFileSync(join(CIVIC, 'bin/signoff'), 'utf8'), /with-temp-root\.mjs/)
})
