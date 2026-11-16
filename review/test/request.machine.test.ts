// oxlint-disable-next-line vitest/no-import-node-test -- Review runs its tests with Node.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { assertAnalysis, assertGraph, replayRegressions } from '@civic/core/testing'
import { requestMachine } from '../src/request.machine.ts'
import { decide } from '@civic/core'
import * as Option from 'effect/Option'

test('request graph covers every event and serialization is complete', () => {
  assertAnalysis(requestMachine)
  const events = ['CLAIM', 'RELEASE', 'RELEASE_REOPENED', 'REPORT_FIX', 'RESOLVE', 'REOPEN', 'AUTO_PASS', 'AUTO_FAIL'].map((type) => ({ type, by: 'actor:a', now: 0, note: 'reviewed', auto: true }))
  const paths = assertGraph(requestMachine, undefined, events, requestMachine.resolveState({ value: 'open', context: { status: 'open', history: [], claim: { by: 'actor:a', expires: '1970-01-01' } } }))
  assert.deepEqual(paths.map((path) => path.state.value).sort(), ['claimed', 'fix-ready', 'open', 'reopened', 'resolved'])
  replayRegressions(requestMachine, `${import.meta.dirname}/../src/request.machine.regressions/*.json`)
})

test('tracked review source cannot assign request status outside the machine', () => {
  const files = execFileSync('git', ['ls-files', 'review/src/**/*.ts', 'review/src/*.ts'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' }).trim().split('\n')
  for (const file of files) {
    if (file.endsWith('/request.machine.ts')) continue
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
    for (const match of source.matchAll(/\b\w+(?:\.status|\[['"]status['"]\])\s*=(?!=)[^\n]*/g)) {
      // Lines have their own lifecycle; only these existing line writes are exempt.
      const lineWrites: Record<string, string[]> = {
        'review/src/loop.ts': ["existing.status = 'open'", "line.status = 'merged'"],
        'review/src/drafts.ts': ["line.status = 'abandoned'", "chosen.status = 'merged'"],
      }
      assert.ok(lineWrites[file]?.includes(match[0]), `${file}: ${match[0]} must go through the machine`)
    }
  }
})

test('claim leases, holders, resolution notes and Auto eligibility guard transitions', () => {
  const context = { status: 'claimed', history: [], claim: { by: 'actor:a', expires: '1970-01-01T00:00:01Z' } }
  const claimed = requestMachine.resolveState({ value: 'claimed', context })
  assert.ok(Option.isNone(decide(requestMachine, claimed, { type: 'CLAIM', by: 'actor:b', now: 999 })))
  assert.ok(Option.isSome(decide(requestMachine, claimed, { type: 'CLAIM', by: 'actor:b', now: 1000 })))
  assert.ok(Option.isSome(decide(requestMachine, claimed, { type: 'CLAIM', by: 'actor:a', now: 0 })))
  assert.ok(Option.isNone(decide(requestMachine, claimed, { type: 'REPORT_FIX', by: 'actor:b' })))
  assert.ok(Option.isSome(decide(requestMachine, claimed, { type: 'REPORT_FIX', by: 'actor:a', now: 2000 })))
  assert.ok(Option.isNone(decide(requestMachine, claimed, { type: 'RESOLVE' })))
  assert.ok(Option.isSome(decide(requestMachine, claimed, { type: 'RESOLVE', note: 'No longer needed' })))
  const ready = requestMachine.resolveState({ value: 'fix-ready', context: { status: 'fix-ready' } })
  assert.ok(Option.isNone(decide(requestMachine, ready, { type: 'AUTO_PASS', auto: false })))
  assert.ok(Option.isSome(decide(requestMachine, ready, { type: 'AUTO_PASS', auto: true })))
})
