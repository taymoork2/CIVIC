import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { typed, untyped } from './commit-type.ts'

test('a commit title needs a conventional type; Git titles pass', () => {
  for (const title of ['fix: Keep the reason plain', 'feat(web)!: Show usage', 'chore: Bump deps\n\nBody', "Merge branch 'x'", 'Revert "fix: a"', 'fixup! fix: a', '# comment\nfeat: after a comment']) assert.ok(typed(title), title)
  for (const title of ['Keep the reason plain', 'fix:no space', 'Fix: capitalised type', 'wip: unknown type', '']) assert.ok(!typed(title), title)
})

test('only commits after main are checked', () => {
  const root = mkdtempSync(join(tmpdir(), 'civic-commit-type-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8' })
  try {
    git('init', '-q', '-b', 'main')
    git('commit', '-q', '--allow-empty', '-m', 'Old untyped history')
    git('switch', '-q', '-c', 'work')
    git('commit', '-q', '--allow-empty', '-m', 'fix: Typed')
    assert.deepEqual(untyped(root), [])
    git('commit', '-q', '--allow-empty', '-m', 'Untyped change')
    assert.deepEqual(untyped(root), ['Untyped change'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
