import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadProject } from '@civic/vite-connector/project'
import { canvasRoot } from '../canvas-root.mjs'
import { runtimeService } from '../runtime-service.mjs'

const dataDir = process.argv[2]
const { join } = path
const project = loadProject(canvasRoot, { manifest: `${canvasRoot}/examples/tasks/civic.project.json` })
project.runtimeEntry = new URL('interrupted-runtime.mjs', import.meta.url).pathname
const service = runtimeService(project, () => 'one', { dataDir })
const run = await service.handle({ action: 'start', scenario: 'tasks.list', persona: 'planner', role: 'member', condition: 'normal', now: 1000 })
await service.handle({ action: 'mutation', run: run.id, name: 'increment', intent: 'complete-0001' })
const watcher = watch(dataDir, async (_event, file) => {
  if (file !== 'blocked') return
  const saved = JSON.parse(await readFile(join(dataDir, 'runtime', `${run.id}.json`), 'utf8'))
  if (saved.journal.some(entry => !entry.complete)) {
    watcher.close()
    process.send({ run: run.id })
  }
})
await service.handle({ action: 'mutation', run: run.id, name: 'hang', intent: 'unfinished-0001', args: { barrier: join(dataDir, 'blocked') } })
