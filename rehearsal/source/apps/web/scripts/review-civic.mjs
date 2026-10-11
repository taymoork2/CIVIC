import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Connects Laundry's review to CIVIC's shared store (decision 0007). Each saved note becomes
 * a CIVIC annotation in the git common directory, which every worktree and local agent
 * reads, and selected annotations become work requests. It runs CIVIC's own `civic` CLI
 * (review/ at the CIVIC repository root), so the journey engine imports nothing from CIVIC
 * and CIVIC imports nothing from Laundry. Returns null when the CLI isn't there, for
 * example in the standalone handoff, and review works as before.
 */
export function civicShared({ repo, civicRoot = resolve(repo, '../..') }) {
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
        if (anchor.label === 'Whole screen') args.push('--target', `target:laundry.${c.scenario}`)
        if (anchor.locator) args.push('--role', anchor.locator.role, '--name', anchor.locator.name)
        // Re-register first, so the annotation names the revision this server is serving now.
        await civic('preview', origin)
        return (await json(...args)).id
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },

    /** The lens: every line, every annotation with its requests, and every request. */
    async list() {
      const [{ current, lines }, annotations, requests] = await Promise.all([json('lines'), json('annotations'), json('requests')])
      return { current, lines, annotations, requests }
    },

    async handOff({ annotationIds, ask, checks }) {
      return json('request', ...annotationIds, '--ask', ask, '--platform', 'web', ...checks.flatMap((check) => ['--check', check]))
    },
  }
}
