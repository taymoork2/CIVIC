import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cp, mkdir, mkdtemp, realpath, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProject, manifestIn } from './review-project.mjs'

// Decision 0020: an app's manifest is civic.json at its root or .civic/civic.json; civic.project.json still works.
const template = fileURLToPath(new URL('../../canvas/examples/notebook', import.meta.url))
async function app(manifest) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'civic-manifest-')))
  const root = join(base, 'app')
  await cp(template, root, { recursive: true })
  if (manifest !== 'civic.project.json') {
    await mkdir(join(root, manifest, '..'), { recursive: true })
    await rename(join(root, 'civic.project.json'), join(root, manifest))
  }
  return { base, root }
}

test('civic.json is found at the app root, then in .civic, before the old name', async () => {
  const { root } = await app('civic.json')
  assert.equal(manifestIn(root), join(root, 'civic.json'))
  await mkdir(join(root, '.civic')); await cp(join(root, 'civic.json'), join(root, '.civic/civic.json')); await cp(join(root, 'civic.json'), join(root, 'civic.project.json'))
  assert.equal(manifestIn(root), join(root, 'civic.json'))
  await rename(join(root, 'civic.json'), join(root, 'elsewhere.json'))
  assert.equal(manifestIn(root), join(root, '.civic/civic.json'))
  await rename(join(root, '.civic/civic.json'), join(root, 'elsewhere-too.json'))
  assert.equal(manifestIn(root), join(root, 'civic.project.json'))
})

test('a manifest in .civic reads its paths from the app root, and an app folder can be given instead of the file', async () => {
  const { base, root } = await app('.civic/civic.json')
  const byFolder = loadProject(base, { manifest: root })
  const byFile = loadProject(base, { manifest: join(root, '.civic/civic.json') })
  assert.equal(byFolder.manifestPath, join(root, '.civic/civic.json'))
  assert.equal(byFolder.manifestRoot, root)
  assert.equal(byFile.scenariosPath, join(root, 'civic.scenarios.json'))
  assert.equal(byFolder.key, byFile.key)
})

test('the old manifest names still load, with one deprecation note each', async () => {
  const { base, root } = await app('civic.project.json')
  const notes = []
  const note = (warning) => { if (warning.code === 'CIVIC_MANIFEST_NAME') notes.push(warning.message) }
  process.on('warning', note)
  loadProject(base, { manifest: root }); loadProject(base, { manifest: root })
  await new Promise((resolve) => setImmediate(resolve))
  process.off('warning', note)
  assert.equal(notes.length, 1)
  assert.match(notes[0], /civic\.project\.json still works, but the manifest is now civic\.json/)
})
