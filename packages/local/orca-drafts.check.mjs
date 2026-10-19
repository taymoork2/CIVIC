import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bindScreens, componentBuildStatus, componentScenarios, components } from './orca-drafts.mjs'
import { liveScenarios } from './orca-live.mjs'
import { checkedScenarios } from '../vite-connector/src/review-project.mjs'

test('curated bindings join screen drafts without replacing historical scenario identities', () => {
  const input = [{ id: 'orca.04.empty', fixture: { family: '04', state: 'empty' } }, { id: 'orca.26.manifest', fixture: { family: '26' } }]
  const rows = bindScreens(input, 'design')
  assert.equal(rows[0].id, input[0].id)
  assert.equal(rows[0].targetId, liveScenarios().find(row => row.fixture.name === 'home').targetId)
  assert.equal(rows[1].targetId, 'orca.study.26')
  assert.equal(input[0].targetId, undefined)
  assert.equal(new Set(liveScenarios().map(row => row.targetId)).size, 7)
})
test('components have export identities and the same targets across isolated and live connections', async () => {
  const live = componentScenarios('live', 'Components'), isolated = componentScenarios('isolated', 'Components')
  assert.equal(live.length, 20)
  assert.equal(new Set(live.map(row => row.componentId)).size, 7)
  assert.equal(new Set(live.map(row => row.id)).size, live.length)
  assert.deepEqual(live.map(row => [row.targetId, row.componentId, row.fixture]), isolated.map(row => [row.targetId, row.componentId, row.fixture]))
  const project = { root: process.cwd(), manifest: { adapter: { kind: 'orca-live' }, navigation: ['Components'] } }
  checkedScenarios(live, project)
  assert.throws(() => checkedScenarios([{ ...live[0], targetId: '../other-app' }], project), /invalid targetId/)
  assert.throws(() => checkedScenarios([{ ...live[0], componentId: 'invalid library key' }], project), /invalid componentId/)
  const source = process.env.CIVIC_ORCA_SOURCE
  if (source) for (const [, , file, name] of components) assert.match(await readFile(`${source}/apps/web/src/components/${file}`, 'utf8'), new RegExp(`export function ${name}\\b`))
})
test('a changed source disables stale compiled component previews without changing screen fixtures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-components-'))
  for (const path of ['apps/web/src', 'packages/contracts/src']) await mkdir(join(root, path), { recursive: true })
  for (const file of ['apps/web/src/component.tsx', 'packages/contracts/src/domain.ts', 'apps/web/package.json', 'pnpm-lock.yaml']) await writeFile(join(root, file), 'changed source')
  await writeFile(join(root, 'components-receipt.json'), JSON.stringify({ sourceHash: 'old-source' }))
  const result = { metadata: { scenarios: [{ fixture: { name: 'home' } }, { fixture: { component: 'modal' } }] } }
  await componentBuildStatus(result, { root, manifestRoot: root })
  assert.equal(result.metadata.scenarios[0].fixture.componentError, undefined)
  assert.match(result.metadata.scenarios[1].fixture.componentError, /Orca changed/)
})
