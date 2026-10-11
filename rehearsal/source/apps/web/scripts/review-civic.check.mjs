import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { civicShared } from './review-civic.mjs'

// The journey engine's link to CIVIC's shared store (decision 0007), run against CIVIC's real
// CLI in a throwaway repository: a canvas note becomes an anchored annotation, and handing it
// off makes a work request any worktree can claim.
const civicRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../..')

test('a canvas note becomes a shared annotation and can be handed to an agent', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'laundry-civic-'))
  const git = (...args) => execFileSync('git', args, { cwd: repo })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'reviewer@example.com'); git('config', 'civic.handle', 'reviewer')
  writeFileSync(join(repo, 'README'), 'x'); git('add', '.'); git('commit', '-q', '-m', 'init')
  const shared = civicShared({ repo, civicRoot })
  assert.ok(shared, 'the civic CLI is found at the CIVIC repository root')

  const context = { scenario: 'intake.pack.color', persona: 'single', role: 'owner', condition: 'normal', theme: 'light', textScale: 2, viewport: { width: 393, height: 852 } }
  const element = await shared.record({ feedback: { message: 'Continue is hard to find.', context, anchor: { label: 'Continue', x: 0.1, y: 0.8, width: 0.8, height: 0.05, locator: { role: 'button', name: 'Continue' } } }, screenshot: Buffer.from('png'), origin: 'http://127.0.0.1:3010' })
  const screen = await shared.record({ feedback: { message: 'Whole step is confusing.', context, anchor: { label: 'Whole screen', x: 0, y: 0, width: 1, height: 1 } }, screenshot: Buffer.from('png2'), origin: 'http://127.0.0.1:3010' })

  const { current, annotations } = await shared.list()
  assert.equal(current, 'line:git.main')
  const byId = Object.fromEntries(annotations.map((entry) => [entry.annotation.id, entry.annotation]))
  assert.deepEqual(byId[element].anchor.locator, { role: 'button', name: 'Continue' })
  assert.deepEqual(byId[screen].anchor.targetIds, ['target:laundry.intake.pack.color'])
  assert.equal(byId[screen].capture.reproduction, '/review-frame.html?scenario=intake.pack.color&persona=single&role=owner&condition=normal&theme=light&scale=2&width=393')
  assert.equal(byId[element].writtenBy, 'actor:person.reviewer')

  const handed = await shared.handOff({ annotationIds: [element, screen], ask: 'Make Continue easy to find.', checks: ['pnpm test'] })
  assert.equal(handed.request.status, 'open')
  assert.equal(handed.lane, 'auto')
  assert.deepEqual((await shared.list()).requests.map((summary) => summary.request.id), [handed.request.id])
})

test('without the civic CLI the review works as before', () => {
  assert.equal(civicShared({ repo: tmpdir(), civicRoot: tmpdir() }), null)
})
