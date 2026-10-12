import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { releaseBreaks, releasesBetween, renderReleases, type GraphDocument, type GraphRecord, type PlatformComponent } from '../src/index.ts'

// Step 10's Design Engineering check: a library release names the variants it leaves without
// a mapping and the product overrides it breaks, asks the library's owners and tells the
// overrides' makers.

function demo(name: string): GraphDocument {
  return JSON.parse(readFileSync(new URL(`../../demo/${name}.graph.json`, import.meta.url), 'utf8')) as GraphDocument
}

function release(document: GraphDocument, componentId: string, edit: (component: PlatformComponent) => void, drop: string[] = []): GraphDocument {
  return {
    ...document,
    records: document.records
      .filter((record) => !drop.includes(record.id))
      .map((record): GraphRecord => {
        if (record.id !== componentId) return record
        const copy = structuredClone(record) as PlatformComponent
        edit(copy)
        return copy
      }),
  }
}

test('a web Card release that drops the selected prop breaks the Shop override, asks the web library and tells the product designer', () => {
  const base = demo('card/out/resolved')
  const head = release(base, 'platform:fluent-react-v9.card', (card) => (card.library.version = '9.8.0'), ['extension:fluent-react-v9.card.selected'])
  const [impact, ...others] = releasesBetween(base, head)
  assert.equal(others.length, 0)
  assert.equal(impact!.componentId, 'platform:fluent-react-v9.card')
  assert.deepEqual([impact!.before, impact!.after], ['9.7.3', '9.8.0'])
  assert.deepEqual(impact!.asked.map((owner) => owner.who), ['fluent-web'])
  assert.deepEqual(
    impact!.broken.map((item) => [item.overrideId, item.before, item.after, item.told.map((owner) => owner.who)]),
    [['override:shop.order-summary.card.state-selected', 'supported', 'needs-library-change', ['shop-design']]],
  )
  // The corner radius override is forbidden by contract on every platform, so no release changes it.
  assert.ok(impact!.broken.every((item) => item.property !== 'corner-radius'))
  assert.equal(releaseBreaks([impact!]), true)
  assert.match(renderReleases([impact!], 'main'), /Product overrides this release breaks:\n\n- \.Card header \/ Checkbox set to true \(`state\.selected` on instance:shop\.order-summary\.card\): supported before, needs-library-change now\./)
})

test('an Android Button release that loses a variant mapping names it as new in the release', () => {
  const base = demo('fluent-button/out/resolved')
  const android = base.records.find((record) => record.id === 'platform:fluent-android.compose-button') as PlatformComponent
  const mapped = android.variants.find((variant) => variant.mapping !== 'none')!
  const head = release(base, android.id, (component) => {
    const variant = component.variants.find((candidate) => candidate.semanticVariant === mapped.semanticVariant)!
    variant.mapping = 'none'
    delete variant.expression
    component.extraVariants = [...(component.extraVariants ?? []), { expression: 'ElevatedButton' }]
  })
  const [impact] = releasesBetween(base, head)
  const variant = impact!.unmapped.find((item) => item.semanticVariant === mapped.semanticVariant)
  assert.equal(variant?.newInRelease, true)
  assert.deepEqual(impact!.newExtraVariants, ['ElevatedButton'])
  assert.equal(releaseBreaks([impact!]), true)
  assert.match(renderReleases([impact!], 'main'), new RegExp(`- ${mapped.semanticVariant} \\(new in this release: it had a mapping before\\)`))
})

test('nothing released means nothing reported, and a release that breaks nothing passes', () => {
  const base = demo('card/out/resolved')
  assert.deepEqual(releasesBetween(base, base), [])
  const patch = release(base, 'platform:fluent-react-v9.card', (card) => (card.library.version = '9.7.4'))
  const impacts = releasesBetween(base, patch)
  assert.equal(impacts.length, 1)
  assert.equal(releaseBreaks(impacts), false)
  assert.match(renderReleases(impacts, 'main'), /Every semantic variant is mapped, and no product override changes\./)
})

test('civic release --since reads the base from git and exits 1 when the release breaks an override', () => {
  const root = mkdtempSync(join(tmpdir(), 'civic-release-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  git('init', '--quiet', '--initial-branch=main')
  git('config', 'user.email', 'civic@example.com')
  git('config', 'user.name', 'CIVIC')
  mkdirSync(join(root, 'out'))
  writeFileSync(join(root, 'civic.check.json'), JSON.stringify({ graphs: ['out/card.json'] }))
  const base = demo('card/out/resolved')
  writeFileSync(join(root, 'out/card.json'), JSON.stringify(base))
  git('add', '.')
  git('commit', '--quiet', '-m', 'base')
  writeFileSync(join(root, 'out/card.json'), JSON.stringify(release(base, 'platform:fluent-react-v9.card', (card) => (card.library.version = '9.8.0'), ['extension:fluent-react-v9.card.selected'])))
  git('commit', '--quiet', '-am', 'release')

  const cli = (...extra: string[]) => spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'release', ...extra], { cwd: root, encoding: 'utf8' })
  const result = cli('--since', 'HEAD~1')
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /## Fluent React v9 Card \[web\] 9\.7\.3 to 9\.8\.0/)
  assert.match(result.stdout, /Told: shop-design \(design\)\./)
  assert.equal(cli('--since', 'HEAD').status, 0)
  assert.match(cli().stderr, /release needs --since/)
})
