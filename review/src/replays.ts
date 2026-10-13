import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { allow, type Context } from './loop.ts'

/**
 * Decision 0009: a replay of a recorded run is run evidence, and its tape is shared by
 * reference beside the review records. This keeps the replays a review server wrote (in its
 * `.review-data/replays/`) in the local store, each with its tape by content hash, so the
 * next `civic sync` shares them. A person or CI chooses to share them (D35); nothing is
 * shared on its own.
 */
export function shareReplays(context: Context, dataDir: string, options: { head?: string } = {}): { kept: number; already: number } {
  allow(context, 'write', 'share replays')
  const directory = join(dataDir, 'replays')
  let files: string[]
  try {
    files = readdirSync(directory).filter((file) => file.endsWith('.json')).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`No replays in ${directory}. Replay a saved run in the canvas first.`)
    throw error
  }
  let kept = 0
  let already = 0
  for (const file of files) {
    const record = readFileSync(join(directory, file))
    const { tape, head } = JSON.parse(record.toString('utf8')) as { tape?: unknown; head?: unknown }
    if (options.head && head !== options.head) continue
    if (typeof tape !== 'string' || !/^[0-9a-f]{64}$/.test(tape)) throw new Error(`${join(directory, file)} is not a civic.replay/0 record: it has no tape hash.`)
    if (context.store.putReplay(record, readFileSync(join(directory, 'tapes', `${tape}.json`)))) kept++
    else already++
  }
  return { kept, already }
}
