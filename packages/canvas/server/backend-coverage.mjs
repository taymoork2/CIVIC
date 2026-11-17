import { readFile, readdir, realpath } from 'node:fs/promises'
import nodePath from 'node:path'
import { createHash } from 'node:crypto'
import { backendCoverage } from '../../shell/server/backend-coverage.mjs'
import { tanstackDetector } from './server-functions.mjs'
import { convexDetector } from './convex-functions.mjs'
import { nextRoutesDetector } from './next-routes.mjs'
import { nextActionsDetector } from './next-actions.mjs'
import { expressDetector } from './express-routes.mjs'
import { honoDetector } from './hono-routes.mjs'
import { fastifyDetector } from './fastify-routes.mjs'
import { elysiaDetector } from './elysia-routes.mjs'
import { nestjsDetector } from './nestjs-routes.mjs'
import { trpcDetector } from './trpc-procedures.mjs'
import { projectPath } from '@civic/vite-connector/project'
import { contractOperations } from './openapi-contract.mjs'

const { relative, join } = nodePath
const detectors = [tanstackDetector, convexDetector, nextRoutesDetector, nextActionsDetector, expressDetector, honoDetector, fastifyDetector, elysiaDetector, nestjsDetector, trpcDetector]

// JSON values cannot contain boxed strings or custom Symbol.toStringTag values.
const isInventoryString = value => Object.prototype.toString.call(value) === '[object String]'

export async function backendInventory(project) {
  const operations = []
  const visited = new Set()
  const scan = async directory => {
    if (visited.has(directory)) return
    visited.add(directory)
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      // oxlint-disable-next-line eslint/no-await-in-loop -- Preserve depth-first inventory order and bounded file reads.
      if (entry.isDirectory() && !entry.name.startsWith('.') && !['node_modules', '_generated'].includes(entry.name)) await scan(path)
      else if (entry.isFile() && /\.[cm]?[jt]sx?$/u.test(entry.name)) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Preserve depth-first inventory order and bounded file reads.
        const code = await readFile(path, 'utf8'), file = relative(project.root, path)
        for (const detector of detectors) operations.push(...detector.detect(code, file).map(row => ({ ...row, detector: detector.name })))
      }
    }
  }
  // oxlint-disable-next-line eslint/no-await-in-loop -- Source roots share visited state and ordered inventory output.
  for (const source of project.sources) await scan(source)
  if (project.manifest.adapter.operations) {
    const path = await realpath(projectPath(project.manifestRoot, project.manifest.adapter.operations))
    if (!path.startsWith(project.root + '/')) throw Error('Backend inventory must belong to the project')
    if (!project.sources.some(source => path.startsWith(source + '/'))) throw Error('Backend inventory must be inside a fingerprinted source root')
    const rows = JSON.parse(await readFile(path, 'utf8'))
    if (!Array.isArray(rows) || rows.length > 10000) throw Error('Invalid backend inventory')
    for (const row of rows) {
      if (!row || !isInventoryString(row.id) || !row.id || row.id.length > 200 || !isInventoryString(row.file) || row.file.startsWith('/') || row.file.split('/').includes('..') || !isInventoryString(row.export) || !['route', 'rpc'].includes(row.kind)) throw Error('Invalid backend operation')
      operations.push({ id: row.id, file: row.file, export: row.export, kind: row.kind })
    }
  }
  if (new Set(operations.map(row => row.id)).size !== operations.length) throw Error('Duplicate backend operation')
  const byId = new Map(operations.map(row => [row.id, row]))
  for (const row of await contractOperations(project)) {
    const existing = byId.get(row.id)
    if (existing) existing.inContract = true
    else { operations.push(row); byId.set(row.id, row) }
  }
  return operations
}

export async function projectBackendCoverage(project, dataDir, metadata, operations) {
  const source = metadata.revision.source
  const tapes = new Map(), replays = []
  let files
  try { files = await readdir(join(dataDir, 'replays')) } catch (error) { if (error.code !== 'ENOENT') throw error; files = [] }
  if (files.length > 1001) throw Error('Replay scan limit reached')
  for (const file of files.filter(name => /^[0-9a-f-]{36}\.json$/u.test(name))) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Bound replay reads and preserve replay iteration order.
    const replay = JSON.parse(await readFile(join(dataDir, 'replays', file), 'utf8'))
    if (!/^[0-9a-f]{64}$/u.test(replay.tape)) throw Error('Invalid replay tape hash')
    // oxlint-disable-next-line eslint/no-await-in-loop -- Verify each tape before advancing to the next replay.
    const bytes = await readFile(join(dataDir, 'replays/tapes', replay.tape + '.json'))
    if (createHash('sha256').update(bytes).digest('hex') !== replay.tape) throw Error('Replay tape content changed')
    tapes.set(replay.tape, JSON.parse(bytes)); replays.push(replay)
  }
  const journeys = (metadata.coverage?.targets ?? []).filter(row => row.kind === 'journey')
  const inventory = operations ?? await backendInventory(project)
  if (source !== metadata.revision.source) throw Error('Source changed while reading backend coverage; retry')
  return backendCoverage(inventory, tapes, replays, { project: project.key, source, journeys, contracts: Boolean(project.manifest.adapter.contracts?.length) })
}
