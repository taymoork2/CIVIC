import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitOf } from '../src/coordinator.ts'

test('a diff base from an agent is resolved to a commit, never read as a git option', () => {
  const repo = mkdtempSync(join(tmpdir(), 'civic-base-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  git('-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'one')
  assert.equal(commitOf(repo, 'main'), git('rev-parse', 'HEAD'))
  const target = join(repo, 'written')
  for (const base of [`--output=${target}`, '-p', 'no-such-ref', '']) assert.throws(() => commitOf(repo, base), /is not a commit/)
  assert.equal(existsSync(target), false)
})
