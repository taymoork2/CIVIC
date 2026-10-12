import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverScreens, generatedScenarios } from './review-discovery.mjs'
import { projectPicker } from './review-projects.mjs'
import { loadProject, checkedScenarios } from './review-project.mjs'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
async function fixture() {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'rehearsal-discovery-'))
  await mkdir(join(root, 'src'))
  for (const [name, text] of Object.entries({
    'index.html': '<h1>Notes</h1><a href="draft.html">Write note</a><a href="archive.html">Browse archive</a><a href="https://example.invalid">External</a>',
    'draft.html': '<h1>Compose</h1><form action="saved.html"><label for="title">Title</label><input id="title" name="title" required><label>Password<input type="password"></label><button>Save note</button></form><a href="index.html">Back home</a>',
    'archive.html': '<h1>Archive</h1><a href="index.html">Back home</a>',
    'saved.html': '<h1>Saved</h1>',
    'Counter.jsx': 'import {useState} from "react"; export default function Counter({initial=0}) {const [n,setN]=useState(initial);return <button onClick={()=>setN(n+1)}>{n}</button>}',
    'context.tsx': 'export function Account(){const data=useQuery(api.users.get);return <h1>Account</h1>}',
    'skip.test.tsx': 'export function Skip(){return <h1>Test</h1>}',
    '.env': 'SECRET=not-scanned',
  })) await writeFile(join(root, 'src', name), text)
  return root
}
test('bounded source discovery finds HTML/React candidates, real links, missing targets and context limits', async () => {
  const root = await fixture(), first = await discoverScreens(root, 'src')
  assert.equal(first.candidates.length, 6)
  assert.equal(first.candidates[0].route, '/')
  assert.equal(first.candidates.find((row) => row.label === 'Account').available, false)
  assert.ok(first.candidates.find((row) => row.export === 'default').available)
  assert.ok(first.edges.some((edge) => edge.action === 'Save note'))
  assert.equal(first.unmapped.length, 1)
  const fields = first.candidates.find((row) => row.label === 'Compose').captureFields
  assert.ok(fields.includes('Title')); assert.ok(!fields.includes('Password'))
  assert.deepEqual(await discoverScreens(root, 'src'), first)
  await writeFile(join(root, 'src/saved.html'), '<h1>Changed saved</h1>')
  assert.notEqual((await discoverScreens(root, 'src')).sourceHash, first.sourceHash)
  await writeFile(join(root, 'src/large.jsx'), 'export function Large(){return <h1>Large</h1>}' + ' '.repeat(500_000))
  const bounded = await discoverScreens(root, 'src')
  assert.equal(bounded.truncated, true)
  assert.ok(!bounded.candidates.some((row) => row.label === 'Large'))
  await assert.rejects(discoverScreens(root, '../outside'), /invalid relative path/)
})
test('confirmed scenarios retain named branches/returns and refuse unsupported screens and ambiguous actions', async () => {
  const root = await fixture(), discovery = await discoverScreens(root, 'src')
  const selected = discovery.candidates.filter((row) => row.kind === 'html').map((row) => row.id)
  const input = { selected, edges: discovery.edges.filter((edge) => selected.includes(edge.from) && selected.includes(edge.to)), journey: 'Write a note' }
  const scenarios = generatedScenarios(discovery, input)
  checkedScenarios(scenarios, { root, manifest: { adapter: { kind: 'module' }, navigation: ['Main'] } })
  assert.ok(scenarios.find((row) => row.label === 'Archive').branchOf)
  assert.ok(scenarios.find((row) => row.label === 'Compose').edges.some((edge) => edge.returnTo))
  assert.throws(() => generatedScenarios(discovery, { ...input, selected: [discovery.candidates.find((row) => !row.available).id] }), /needs a project-specific/)
  assert.throws(() => generatedScenarios(discovery, { ...input, edges: [...input.edges, input.edges[0]] }), /one destination/)
  assert.throws(() => generatedScenarios(discovery, { ...input, overrides: { [selected[0]]: { props: 'invalid' } } }), /JSON object/)
  assert.throws(() => generatedScenarios(discovery, { ...input, overrides: { [selected[0]]: { captureFields: ['Password'] } } }), /non-secret/)
})
test('onboarding generation owns its files, rejects stale source and does not import or change the app', async () => {
  const root = await fixture(), host = await mkdtemp(join(await realpath(tmpdir()), 'rehearsal-discovery-host-'))
  const current = loadProject(repo, { manifest: join(repo, 'apps/web/examples/rehearsal-demo/civic.project.json') })
  const picker = await projectPicker(host, current)
  const before = await readFile(join(root, 'src/index.html'), 'utf8')
  const { discovery } = await picker.discover({ root, source: 'src' })
  const selected = discovery.candidates.filter((row) => row.available).map((row) => row.id)
  const input = { discovery: discovery.id, sourceHash: discovery.sourceHash, selected, edges: discovery.edges.filter((edge) => selected.includes(edge.from) && selected.includes(edge.to)), name: 'Discovered app' }
  const result = await picker.generate(input)
  assert.equal(result.preview, true); assert.equal(result.screens, 5)
  const row = (await picker.list()).projects.find((row) => row.key === result.key)
  assert.equal(row.root, root); assert.ok(row.manifest.startsWith(join(host, 'rehearsal-projects/')))
  assert.match(await readFile(join(row.manifest, '../rehearsal.ts'), 'utf8'), /mountDiscovered/)
  assert.equal(JSON.parse(await readFile(row.manifest)).adapter.entry, 'rehearsal.ts')
  assert.deepEqual(await readdir(root), ['src']); assert.equal(await readFile(join(root, 'src/index.html'), 'utf8'), before)
  await writeFile(join(root, 'src/index.html'), before + '<p>Changed</p>')
  await assert.rejects(picker.generate(input), /Source changed/)
})
