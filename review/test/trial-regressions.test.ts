import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { callTool } from '../src/mcp.ts'
import { run } from '../src/index.ts'

const repo = fileURLToPath(new URL('../../', import.meta.url))
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'civic-trial-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', `test: ${root}`], { cwd: root })
  cpSync(join(repo, 'packages/canvas/examples/tasks'), join(root, 'app'), { recursive: true })
  return root
}
test('symlinked project CLI executes', () => {
  const root = fixture()
  symlinkSync(repo, join(root, 'civic'))
  const output = execFileSync(process.execPath, [join(root, 'civic/packages/vite-connector/src/review-project.mjs'), 'check', '--project', join(root, 'app')], { encoding: 'utf8' })
  assert.match(output, /tasks/)
})
test('MCP coverage accepts an absolute manifest from another repo and reports project HEAD', async () => {
  const cwd = fixture(), project = fixture()
  const [result] = await callTool('coverage', { cwd, project: join(project, 'app/civic.project.json') })
  const report = JSON.parse((result as { text: string }).text)
  assert.equal(report.revision, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim())
})
test('unmeasured coverage has no evidence timestamp', async () => {
  const cwd = fixture()
  const [result] = await callTool('coverage', { cwd, project: join(cwd, 'app/civic.project.json') })
  assert.equal(JSON.parse((result as { text: string }).text).evidenceAt, null)
  assert.match(JSON.parse((result as { text: string }).text).hints.join(' '), /No evidence/)
})
test('backend text names operations and empty inventory explains detection', async () => {
  const cwd = fixture(), output: string[] = []
  await run(['coverage', '--backend', '--project', join(cwd, 'app')], cwd, process.env, text => output.push(text))
  assert.match(output.join('\n'), /GET:\/api\/tasks/)
  writeFileSync(join(cwd, 'app/server/routes.json'), '[]')
  output.length = 0
  await run(['coverage', '--backend', '--project', join(cwd, 'app')], cwd, process.env, text => output.push(text))
  assert.match(output.join('\n'), /No operations.*detectors.*adapter.contracts/is)
  const [result] = await callTool('backend_coverage', { cwd, project: join(cwd, 'app') })
  const report = JSON.parse((result as { text: string }).text)
  const { backendDetectorNames } = await import(new URL('../../packages/canvas/server/backend-coverage.mjs', import.meta.url).href)
  assert.deepEqual(report.detectors, backendDetectorNames)
  assert.match(report.note, /No operations.*adapter.contracts/s)
})
test('CLI and MCP elements refuse invalid queries but accept empty real files', async () => {
  const cwd = fixture()
  writeFileSync(join(cwd, 'captures.json'), '[]')
  symlinkSync(join(repo, 'README.md'), join(cwd, 'escape.tsx'))
  for (const file of ['missing.tsx', '../outside.tsx', '/outside.tsx', 'node_modules/pkg.tsx', 'escape.tsx']) {
    await assert.rejects(callTool('elements', { cwd, file, captures: 'captures.json' }))
    await assert.rejects(run(['elements', file, '--capture', 'captures.json'], cwd, process.env, () => {}))
  }
  const [result] = await callTool('elements', { cwd, file: 'captures.json', captures: 'captures.json' })
  assert.equal((result as { text: string }).text, '[]')
  const [absolute] = await callTool('elements', { cwd, file: join(cwd, 'captures.json'), captures: 'captures.json' })
  assert.equal((absolute as { text: string }).text, '[]')
})
test('explicit manifests ignore the ambient application root', async () => {
  const cwd = fixture()
  const { loadProject } = await import(new URL('../../packages/vite-connector/src/review-project.mjs', import.meta.url).href)
  const previous = process.env.CIVIC_APP_ROOT
  mkdirSync(join(cwd, 'unrelated'))
  process.env.CIVIC_APP_ROOT = join(cwd, 'unrelated')
  try { assert.equal(loadProject(cwd, { manifest: join(cwd, 'app') }).root, join(cwd, 'app')) }
  finally { if (previous === undefined) delete process.env.CIVIC_APP_ROOT; else process.env.CIVIC_APP_ROOT = previous }
})
