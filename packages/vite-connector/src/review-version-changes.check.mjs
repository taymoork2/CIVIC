import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compareVersionScreens } from './review-version-changes.mjs'

async function fixture(files, label = 'a') {
  const folder = await mkdtemp(join(tmpdir(), 'civic-version-changes-')), root = join(folder, 'source')
  await mkdir(root)
  for (const [path, value] of Object.entries(files)) { const file = join(root, path); await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, value) }
  await writeFile(join(folder, 'receipt.json'), JSON.stringify({ source: root, ui: label, server: label }))
  const project = { root, manifestRoot: folder, manifestPath: join(folder, 'civic.project.json'), entry: join(folder, 'preview.mjs'), aliases: {}, manifest: { sources: ['src'] } }
  const screen = { id: `${label}.home`, label: 'Home', targetId: 'app.home', component: 'src/pages.tsx', componentExport: 'Home', route: '/', fixture: { state: 'ready' }, edges: [] }
  return { project, screen, root, folder }
}
const compare = (a, b, rowsA = [a.screen], rowsB = [b.screen]) => compareVersionScreens(a.project, b.project, rowsA, rowsB, a.screen.id, b.screen.id)

test('compares a selected export rather than unrelated screens sharing its file', async () => {
  const a = await fixture({ 'src/pages.tsx': 'export function Home(){return <h1>Home</h1>} export function Settings(){return <h1>Old</h1>}' })
  const b = await fixture({ 'src/pages.tsx': '// new comment\nexport function Home() { return <h1>Home</h1> } export function Settings(){return <h1>New</h1>}' }, 'b')
  const result = await compare(a, b)
  assert.equal(result.status, 'same')
  assert.equal(result.totalChanges, 0)
  assert.deepEqual(result.text, { added: [], removed: [], totalAdded: 0, totalRemoved: 0 })
})
test('local bindings do not pull in unrelated module exports with the same name', async () => {
  const code = 'export function Home({Other}) { const [value] = [Other]; return <div>{value}</div> } export function Other(){return <p>Old</p>}'
  const a = await fixture({ 'src/pages.tsx': code }), b = await fixture({ 'src/pages.tsx': code.replace('Old', 'New') }, 'b')
  assert.equal((await compare(a, b)).status, 'same')
})
test('reports actual labels, interaction code, styling and bounded before/after excerpts', async () => {
  const a = await fixture({ 'src/pages.tsx': '// 🧺 before the export\nexport function Home(){return <button class="small" onClick={()=>1}>Old label</button>}' })
  const b = await fixture({ 'src/pages.tsx': '// 🧺 before the export\nexport function Home(){return <button class="large" onClick={()=>2}>New label</button>}' }, 'b')
  const result = await compare(a, b)
  assert.equal(result.status, 'changed')
  assert.deepEqual(result.text, { added: ['New label'], removed: ['Old label'], totalAdded: 1, totalRemoved: 1 })
  assert.equal(result.eventsChanged, true)
  assert.equal(result.stylesChanged, true)
  assert.equal(result.changes[0].kind, 'selected')
  assert.match(result.changes[0].before, /^function Home.*Old label/)
  assert.match(result.changes[0].after, /^function Home.*New label/)
})
test('follows named imports through barrels and local helpers without including unused exports', async () => {
  const files = { 'src/pages.tsx': 'import {Button as Control} from "./barrel"; const caption="Click me"; export const Home=()=> <Control label={caption}/>;', 'src/barrel.ts': 'export * from "./unrelated"; export {Button} from "./ui";', 'src/unrelated.ts': 'export const unrelated=1', 'src/ui.tsx': 'export const Button=(p)=><button>{p.label}</button>; export const Other=()=> <div>Old</div>;' }
  const a = await fixture(files)
  const b = await fixture({ ...files, 'src/ui.tsx': files['src/ui.tsx'].replace('Old', 'New') }, 'b')
  assert.equal((await compare(a, b)).status, 'same')
  const c = await fixture({ ...files, 'src/ui.tsx': files['src/ui.tsx'].replace('<button>', '<button class="new">') }, 'c')
  const result = await compare(a, c)
  assert.equal(result.status, 'changed')
  assert.equal(result.changes[0].name, 'Button')
  assert.equal(result.changes[0].kind, 'dependency')
})

test('local imported prop contracts participate in component comparisons', async () => {
  const files = { 'src/pages.tsx': 'import type {Props} from "./props"; export const Home=(props:Props)=><div>{props.label}</div>', 'src/props.ts': 'export interface Props {label:string}' }
  const a = await fixture(files), b = await fixture({ ...files, 'src/props.ts': 'export interface Props {label:string; disabled?:boolean}' }, 'b')
  const result = await compare(a, b)
  assert.equal(result.status, 'changed')
  assert.equal(result.changes[0].name, 'Props')
})
test('compares registered states and action destinations using screen identity, not connection prefixes', async () => {
  const a = await fixture({ 'src/pages.tsx': 'export const Home=()=>null' })
  const b = await fixture({ 'src/pages.tsx': 'export const Home=()=>null' }, 'b')
  a.screen.edges = [{ action: 'Continue', destination: a.screen.id }]
  b.screen.edges = [{ action: 'Continue', destination: b.screen.id }]
  assert.equal((await compare(a, b)).status, 'same')
  b.screen.edges.push({ action: 'Open menu', destination: b.screen.id })
  const result = await compare(a, b, [a.screen], [b.screen, { ...b.screen, id: 'b.empty', label: 'Empty', fixture: { state: 'empty' } }])
  assert.deepEqual(result.states.added, ['empty'])
  assert.deepEqual(result.actions.added, ['Open menu → Home'])
  assert.equal(result.status, 'changed')
})
test('uses compiled snapshots even when source checkouts have uncommitted changes', async () => {
  const files = { 'src/pages.tsx': 'export const Home=()=> <div>Built screen</div>;' }
  const a = await fixture(files), b = await fixture(files, 'b')
  const checkout = join(a.folder, 'checkout'); await mkdir(join(checkout, 'src'), { recursive: true })
  await writeFile(join(checkout, 'src/pages.tsx'), 'export const Home=()=> <div>Unbuilt edit</div>;')
  a.project.root = checkout
  assert.equal((await compare(a, b)).status, 'same')
})
test('does not turn absent snapshots, broken exports, parse errors or escaped imports into unchanged claims', async () => {
  const a = await fixture({ 'src/pages.tsx': 'export const Home=()=>null' })
  const missing = await fixture({ 'src/pages.tsx': 'export const Home=()=>null' }, 'b')
  await writeFile(join(missing.folder, 'receipt.json'), '{}')
  assert.equal((await compare(a, missing)).status, 'unavailable')
  for (const code of ['export const Other=()=>null', 'export const Home=()=> <', 'import {secret} from "../../outside";export const Home=()=>secret', 'import {Widget} from "#unknown-alias";export const Home=()=> <Widget/>']) {
    const b = await fixture({ 'src/pages.tsx': code }, 'b')
    const result = await compare(a, b)
    assert.equal(result.status, 'unavailable')
    assert.ok(result.limits.length)
  }
})
test('shared CSS and build inputs remain visible even when the selected export is unchanged', async () => {
  const files = { 'src/pages.tsx': 'export const Home=()=>null', 'src/global.css': 'button{color:red}', 'pnpm-lock.yaml': 'one' }
  const a = await fixture(files)
  const b = await fixture({ ...files, 'src/global.css': 'button{color:blue}' }, 'b')
  assert.equal((await compare(a, b)).stylesChanged, true)
  const c = await fixture({ ...files, 'pnpm-lock.yaml': 'two' }, 'c')
  assert.equal((await compare(a, c)).summary, 'UI code matches · build inputs differ')
})

test('literal dynamic imports participate and unresolved or cyclic exports remain unknown', async () => {
  const files = { 'src/pages.tsx': 'export const Home=()=>import("./lazy")', 'src/lazy.ts': 'export const value=1' }
  const a = await fixture(files), b = await fixture({ ...files, 'src/lazy.ts': 'export const value=2' }, 'b')
  assert.equal((await compare(a, b)).status, 'changed')
  const dynamic = await fixture({ 'src/pages.tsx': 'export const Home=(path)=>import(path)' }, 'c')
  assert.equal((await compare(a, dynamic)).status, 'unavailable')
  const cyclic = await fixture({ 'src/pages.tsx': 'export * from "./cycle"', 'src/cycle.ts': 'export * from "./pages"' }, 'd')
  assert.equal((await compare(a, cyclic)).status, 'unavailable')
})
test('rejects unrelated scopes and bounds source reads', async () => {
  const a = await fixture({ 'src/pages.tsx': 'export const Home=()=>null' })
  const b = await fixture({ 'src/pages.tsx': 'export const Home=()=>null' }, 'b')
  b.screen.targetId = 'another.screen'
  await assert.rejects(compare(a, b), { status: 400 })
  b.screen.targetId = a.screen.targetId
  await writeFile(join(b.root, 'src/pages.tsx'), ' '.repeat(500_001))
  assert.equal((await compare(a, b)).status, 'unavailable')
})

test('abandoning a comparison stops source traversal', async () => {
  const a = await fixture({ 'src/pages.tsx': 'export const Home=()=>null' }), b = await fixture({ 'src/pages.tsx': 'export const Home=()=>null' }, 'b')
  const controller = new AbortController()
  const pending = compareVersionScreens(a.project, b.project, [a.screen], [b.screen], a.screen.id, b.screen.id, controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})

test('very wide namespace imports stop at the traversal budget instead of reporting unchanged', async () => {
  const code = Array.from({ length: 2001 }, (_, index) => `export const item${index}=${index};`).join('\n')
  const files = { 'src/pages.tsx': 'import * as values from "./values"; export const Home=()=>values.item0;', 'src/values.ts': code }
  const a = await fixture(files), b = await fixture(files, 'b')
  const result = await compare(a, b)
  assert.equal(result.status, 'unavailable')
  assert.ok(result.limits.some(value => value.includes('traversal limit')))
})
