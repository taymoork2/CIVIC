#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { defaultStore, startCanvas } from '../server/canvas-host.mjs'

const usage = `Usage: civic-canvas [--project <app>/civic.project.json] [--store <folder>] [--port 3020]

Opens CIVIC's journey canvas for an app with a civic.project.json, on 127.0.0.1.
--project  the app to open; later runs reopen the last app chosen in the canvas
--store    where reviews and connections are kept (default ~/.civic/canvas, or CIVIC_STORE)
--port     the local port (default 3020)`

const { values } = parseArgs({ options: { project: { type: 'string' }, store: { type: 'string' }, port: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
if (values.help) { console.log(usage); process.exit(0) }
try {
  const server = await startCanvas({ project: values.project, store: values.store ?? defaultStore(), port: values.port ? Number(values.port) : 3020 })
  server.printUrls()
  console.log(`Open ${server.resolvedUrls.local[0]}review`)
} catch (error) {
  console.error(error.message)
  console.error(usage)
  process.exit(1)
}
