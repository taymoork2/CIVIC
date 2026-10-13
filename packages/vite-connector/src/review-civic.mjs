import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

// This package sits at packages/vite-connector/src in a CIVIC checkout, so the checkout is three folders up.
const packaged = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Connects a host's review to CIVIC's shared store (decision 0007). Each saved note becomes
 * a CIVIC annotation in the reviewed repository's git common directory, which every worktree
 * and local agent reads, and selected annotations become work requests. It runs CIVIC's own
 * `civic` CLI (review/ at the CIVIC repository root), so the app imports nothing from CIVIC and
 * CIVIC imports nothing from the app (decision 0010). The CLI is found through CIVIC_ROOT, or
 * else in the CIVIC checkout this package came from. `product` is the app's product ID in
 * CIVIC's graphs: a scenario's target is `target:<product>.<scenario>`. Returns null when the
 * CLI isn't there, and review works without the shared store.
 */
export function civicShared({ repo, product, civicRoot = process.env.CIVIC_ROOT || packaged }) {
  if (!/^[a-z0-9-]+$/.test(product ?? '')) throw new Error('civicShared needs the product ID its graph targets use, like "laundry"')
  const cli = join(civicRoot, 'review', 'src', 'cli.ts')
  if (!existsSync(cli)) return null
  // A person makes every canvas note, even when an agent started this server.
  const env = { ...process.env }
  delete env.CIVIC_AGENT
  delete env.CIVIC_FOR
  const civic = async (...args) => (await run(process.execPath, [cli, ...args], { cwd: repo, env, maxBuffer: 16 * 1024 * 1024 })).stdout
  const json = async (...args) => JSON.parse(await civic(...args, '--json'))

  return {
    /** Tells CIVIC this server is the line's preview, behind the local access key in `keyFile`. */
    registerPreview: (url, keyFile) => civic('preview', url, '--bearer-file', keyFile),

    async record({ feedback, screenshot, origin }) {
      const dir = await mkdtemp(join(tmpdir(), 'civic-note-'))
      try {
        const image = join(dir, 'capture.png')
        await writeFile(image, screenshot, { mode: 0o600 })
        const c = feedback.context
        const scenario = new URLSearchParams({ scenario: c.scenario, persona: c.persona, role: c.role, condition: c.condition, theme: c.theme, scale: String(c.textScale), width: String(c.viewport.width) })
        const { anchor } = feedback
        const args = ['annotate', feedback.message, '--image', image, '--url', `${origin}/review-frame.html?${scenario}`, '--viewport', `${c.viewport.width}x${c.viewport.height}`, '--rect', [anchor.x, anchor.y, Math.min(anchor.width, 1 - anchor.x), Math.min(anchor.height, 1 - anchor.y)].map((n) => Math.max(0, n).toFixed(4)).join(','), '--rect-label', anchor.label]
        // A whole-screen note anchors to the scenario's target, which the frame carries as data-civic-id.
        if (anchor.label === 'Whole screen') args.push('--target', `target:${product}.${c.scenario}`)
        if (anchor.locator) args.push('--role', anchor.locator.role, '--name', anchor.locator.name)
        // Re-register first, so the annotation names the revision this server is serving now.
        await civic('preview', origin)
        return (await json(...args)).id
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },

    /**
     * The lens: every line, every annotation with its requests, and every request. Each open
     * design draft also comes with its design lens (D36), the frames it changes from its base
     * read on this checkout's code line, and each target with the open lines changing it.
     */
    async list() {
      const [{ current, lines, lenses, changing }, annotations, requests] = await Promise.all([json('lines'), json('annotations'), json('requests')])
      return { current, lines, annotations, requests, lenses, changing }
    },

    /**
     * What CIVIC's graphs know about one screen (decision 0004: the canvas is a viewer of the
     * graph): its journeys, paths, run evidence and gate findings. Reads the graphs listed in
     * the CIVIC repository's civic.check.json; null when no graph has the screen. A scenario's
     * target ID is the one its whole-screen annotations use.
     */
    async screen(scenario) {
      if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(scenario)) throw Object.assign(new Error('Not a scenario ID'), { status: 400 })
      const targetId = `target:${product}.${scenario}`
      try {
        const out = await run(process.execPath, [join(civicRoot, 'graph', 'src', 'cli.ts'), 'screen', targetId, '--config', join(civicRoot, 'civic.check.json'), '--json'], { cwd: civicRoot, env, maxBuffer: 4 * 1024 * 1024 })
        return JSON.parse(out.stdout)
      } catch (error) {
        if (error.code === 3) return null
        throw error
      }
    },

    async handOff({ annotationIds, ask, checks }) {
      return json('request', ...annotationIds, '--ask', ask, '--platform', 'web', ...checks.flatMap((check) => ['--check', check]))
    },
  }
}
