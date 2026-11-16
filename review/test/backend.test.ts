import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { run } from '../src/index.ts'
import { callTool } from '../src/mcp.ts'
import { execFileSync } from 'node:child_process'

test('CLI and MCP return the same derived backend inventory without opening a preview', async () => {
  const store = mkdtempSync(join(tmpdir(), 'civic-backend-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: store })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'test: fixture'], { cwd: store })
  const project = fileURLToPath(new URL('../../packages/canvas/examples/tasks', import.meta.url))
  const output: string[] = []
  assert.equal(await run(['coverage', '--backend', '--project', project, '--store', store, '--json'], store, process.env, text => output.push(text)), 0)
  const result = await callTool('backend_coverage', { cwd: store, project, store })
  assert.equal(result[0]?.type, 'text')
  const backend = JSON.parse(output[0]!)
  assert.deepEqual(JSON.parse((result[0] as { text: string }).text), backend)
  assert.deepEqual(backend.unreached, ['GET:/api/tasks', 'PATCH:/api/tasks/:id', 'POST:/api/tasks'])
})
