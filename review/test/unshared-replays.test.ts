import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { unsharedPassingReplays } from '../src/replays.ts'
import type { StoredReplay } from '../src/store.ts'

test('unshared notice counts only current project and source passes absent from the shared store', () => {
  const root = mkdtempSync(join(tmpdir(), 'unshared-replays-'))
  assert.equal(unsharedPassingReplays(root, 'p', 's', []), 0)
  mkdirSync(join(root, 'replays'))
  const replay: StoredReplay = { schema: 'civic.replay/0', project: 'p', source: 's', scenario: 'home', head: 'a'.repeat(40), tape: 'b'.repeat(64), steps: 0, outcome: 'pass', replayedAt: 'now' }
  for (const row of [replay, { ...replay, source: 'old' }, { ...replay, project: 'other' }, { ...replay, outcome: 'fail' }]) writeFileSync(join(root, 'replays', randomUUID() + '.json'), JSON.stringify(row))
  assert.equal(unsharedPassingReplays(root, 'p', 's', []), 1)
  assert.equal(unsharedPassingReplays(root, 'p', 's', [replay]), 0)
})
