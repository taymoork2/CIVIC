#!/usr/bin/env node
// civic: the review to agent loop (decision 0007). Annotations, work requests, claims and
// fix reports live in the git common directory, shared by every worktree (D39). CIVIC
// re-captures reported fixes with Playwright and makes no model calls (D30).
//
// Agents run with CIVIC_AGENT=<harness> and CIVIC_FOR=<person>; everyone else is a person.

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { extname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAnchored, loadGraph, type Annotation, type CaptureRef, type EdgeRef, type GraphDocument, type Lane, type Owner, type Platform, type RequestStatus, type Role, PLATFORMS, ROLES, REQUEST_STATUSES } from '../../graph/src/index.ts'
import { homedir } from 'node:os'
import { ACCESS_FILE, loadAccess, personOf, scopesOf } from './access.ts'
import { git, readCheckout } from './git.ts'
import { generateKey, readKey } from './signing.ts'
import { actorId, identityFromEnv } from './identity.ts'
import {
  acceptCheck,
  addCheck,
  annotate,
  claim,
  comment,
  createRequest,
  escalate,
  find,
  getRequest,
  lineIdFor,
  listRequests,
  registerPreview,
  registerPullRequest,
  release,
  reopen,
  reportFix,
  resolve,
  reviewQueue,
  type Context,
} from './loop.ts'
import { bearerFor, captureScenario, launchBrowser, recapture, reproductionUrl } from './recapture.ts'
import { createOverlayServer } from './overlay/server.ts'
import { renderList, renderRequest } from './render.ts'
import { Store } from './store.ts'
import { DEFAULT_REF, GitRefRemote } from './remote.ts'
import { listConflicts, settleConflict, sync } from './sync.ts'

const USAGE = `Usage (records are shared by every worktree of this repository):
  civic annotate "<comment>" [--image <file>] [--url <page>] [--target <id>]... [--edge <from>><to>[:<action>]]...
                 [--test-id <id> | --role <role> --name <name>] [--title <title>]
  civic request <annotation>... --ask "<what to do>" [--check "<command>"]... [--change] [--high-risk]
                 [--owner <role>:<who>]... [--platform <p>] [--context <semantic-id>]...
  civic requests [--status open,claimed,...] [--lane auto|batch-review|owner-sign-off] [--json]
  civic show <request> [--graph <file>] [--json]
  civic claim <request> [--lease <minutes>]       civic release <request>
  civic comment <request> "<text>"
  civic report-fix <request> [--preview <url>] [--note "<text>"] [--revision <sha>] [--recapture]
  civic recapture <request> [--no-checks]         civic repro <request> --url <preview> [--capture <dir>]
  civic queue                                     civic resolve <request>... [--note "<text>"]
  civic reopen <request> --note "<text>"          civic escalate <request> --lane batch-review|owner-sign-off
  civic add-check <request> "<command>"           civic accept-check <request> <number>
  civic overlay [--port 4777]                     serves the capture overlay for dev and preview pages
  civic preview <url> [--bearer-file <file>]      civic lines [--json] | annotations [--line <id>] [--json] | whoami
  civic pr <number> [--preview <url>] [--remote origin]   a pull request as its own line, with its hosted preview
  civic sync [--remote origin] [--ref refs/civic/records]   share records with the team through a git ref
  civic conflicts [--json]                        civic settle <record> --keep mine|theirs
  civic keygen [--out <file>]                     makes your signing key for civic sync
  annotate also takes --rect x,y,w,h [--rect-label <text>], --viewport <w>x<h> and --json; request takes --json.
  A <request> may end in @<version>, as civic requests and civic queue print it: the write is refused if the
  request changed since. Who may read, write, approve and resolve comes from civic.access.json on the default branch.`

const MEDIA: Record<string, CaptureRef['mediaType']> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

export async function run(argv: string[], cwd = process.cwd(), env = process.env, print = (text: string) => console.log(text)): Promise<number> {
  const [command, ...rest] = argv
  const { positional, flags, has } = parse(rest)
  const one = (name: string) => flags.get(name)?.at(-1)
  const checkout = readCheckout(cwd)
  const store = Store.forCommonDir(checkout.commonDir)
  const context: Context = { store, checkout, identity: identityFromEnv(env, checkout.root) }
  const need = (count: number) => {
    if (positional.length < count) throw new UsageError(`${command} needs ${count === 1 ? 'an argument' : `${count} arguments`}.`)
  }
  const show = (value: { id: string; status?: string }) => print(`${value.id}${value.status ? ` ${value.status}` : ''}`)

  switch (command) {
    case 'annotate': {
      need(1)
      const image = one('--image')
      const role = one('--role')
      const name = one('--name')
      const testId = one('--test-id')
      if ((role === undefined) !== (name === undefined)) throw new UsageError('A role locator needs both --role and --name.')
      const url = one('--url')
      const rect = one('--rect')
      const viewport = one('--viewport')
      const annotation = annotate(context, {
        comment: positional.join(' '),
        ...(one('--title') ? { title: one('--title')! } : {}),
        targetIds: flags.get('--target') ?? [],
        edges: (flags.get('--edge') ?? []).map(parseEdge),
        ...(testId || role ? { locator: { ...(testId ? { testId } : {}), ...(role ? { role, name: name! } : {}) } } : {}),
        ...(image ? { image: { bytes: readFileSync(resolvePath(cwd, image)), mediaType: mediaOf(image) } } : {}),
        ...(url ? { url } : {}),
        ...(rect ? { rect: parseRect(rect, one('--rect-label')) } : {}),
        ...(viewport ? { viewport: parseViewport(viewport) } : {}),
      })
      print(has('--json') ? JSON.stringify(annotation, null, 2) : `${annotation.id}${isAnchored(annotation.anchor) ? '' : ' (unanchored)'}`)
      return 0
    }
    case 'request': {
      need(1)
      const ask = one('--ask')
      if (!ask) throw new UsageError('Say what to do with --ask.')
      const platform = one('--platform')
      if (platform !== undefined && !(PLATFORMS as readonly string[]).includes(platform)) throw new UsageError(`Unknown platform: ${platform}`)
      const request = createRequest(context, {
        annotationIds: positional,
        ask,
        change: has('--change'),
        highRisk: has('--high-risk'),
        checks: flags.get('--check') ?? [],
        owners: (flags.get('--owner') ?? []).map(parseOwner),
        ...(platform ? { platform: platform as Platform } : {}),
        contextIds: flags.get('--context') ?? [],
      })
      print(has('--json') ? JSON.stringify(getRequest(context, request.id), null, 2) : `${request.id} open, lane ${getRequest(context, request.id).lane}`)
      return 0
    }
    case 'requests': {
      const status = one('--status')?.split(',') as RequestStatus[] | undefined
      for (const value of status ?? []) if (!(REQUEST_STATUSES as readonly string[]).includes(value)) throw new UsageError(`Unknown status: ${value}`)
      const summaries = listRequests(context, { ...(status ? { status } : {}), ...(one('--lane') ? { lane: one('--lane') as Lane } : {}) })
      print(has('--json') ? JSON.stringify(summaries, null, 2) : renderList(summaries))
      return 0
    }
    case 'show': {
      need(1)
      const summary = getRequest(context, positional[0]!)
      if (has('--json')) {
        const document = store.read()
        const annotations = summary.request.annotationIds.map((id) => find<Annotation>(document, id, 'annotation'))
        print(JSON.stringify({ ...summary, annotations }, null, 2))
        return 0
      }
      const graphFile = one('--graph')
      print(renderRequest(store.read(), summary, { store, ...(graphFile ? { graph: await loadGraph(resolvePath(cwd, graphFile)) } : {}) }))
      return 0
    }
    case 'claim': {
      need(1)
      const lease = one('--lease')
      if (lease !== undefined && !(Number.isFinite(Number(lease)) && Number(lease) > 0)) throw new UsageError(`--lease is a number of minutes above zero. Got ${lease}.`)
      const request = claim(context, positional[0]!, lease !== undefined ? Number(lease) : undefined)
      print(`${request.id} claimed by ${request.claim!.by} on ${request.claim!.line} until ${request.claim!.expires}`)
      return 0
    }
    case 'release':
      need(1)
      show(release(context, positional[0]!))
      return 0
    case 'comment':
      need(2)
      show(comment(context, positional[0]!, positional.slice(1).join(' ')))
      return 0
    case 'report-fix': {
      need(1)
      const preview = one('--preview')
      const note = one('--note')
      const revision = one('--revision')
      const reported = reportFix(context, positional[0]!, { ...(preview ? { preview } : {}), ...(note ? { note } : {}), ...(revision ? { revision } : {}) })
      show(reported)
      if (has('--recapture')) {
        const result = await recapture(context, reported.id)
        for (const anchor of result.recapture.anchors) print(`${anchor.annotationId}: ${anchor.outcome}`)
        print(`${result.request.id} ${result.request.status}`)
      }
      return 0
    }
    case 'recapture': {
      need(1)
      const result = await recapture(context, positional[0]!, { runChecks: !has('--no-checks') })
      for (const anchor of result.recapture.anchors) print(`${anchor.annotationId}: ${anchor.outcome}`)
      for (const check of result.recapture.checks) print(`${check.outcome.padEnd(4)} ${check.command}${result.checkNotes[check.command] ? ` (${result.checkNotes[check.command]})` : ''}`)
      for (const command of result.skippedChecks) print(`skip ${command} (not written or accepted by a person)`)
      print(`${result.request.id} ${result.request.status}, lane ${getRequest(context, result.request.id).lane}`)
      return 0
    }
    case 'repro': {
      need(1)
      const url = one('--url')
      if (!url) throw new UsageError('repro needs --url <preview>.')
      const document = store.read()
      const summary = getRequest(context, positional[0]!)
      const annotations = summary.request.annotationIds.map((id) => find<Annotation>(document, id, 'annotation'))
      const dir = one('--capture')
      if (!dir) {
        for (const annotation of annotations) print(`${reproductionUrl(annotation, url)}  ${annotation.title}`)
        return 0
      }
      // A read-only capture: it shows where each anchor lands on that preview and writes nothing to the store.
      mkdirSync(resolvePath(cwd, dir), { recursive: true })
      const browser = await launchBrowser(env)
      try {
        for (const annotation of annotations) {
          const shot = await captureScenario(browser, annotation, url, bearerFor(context, url))
          const file = shot.png ? join(resolvePath(cwd, dir), `${annotation.id.slice('annotation:'.length)}.png`) : undefined
          if (file) writeFileSync(file, shot.png!)
          print(`${shot.outcome.padEnd(16)} ${shot.url}${file ? `  ${file}` : ''}`)
        }
      } finally {
        await browser.close()
      }
      return 0
    }
    case 'queue':
      print(renderList(reviewQueue(context)))
      return 0
    case 'resolve':
      need(1)
      for (const request of resolve(context, positional, one('--note'))) show(request)
      return 0
    case 'reopen': {
      need(1)
      const note = one('--note')
      if (!note) throw new UsageError('Say what still needs doing with --note.')
      show(reopen(context, positional[0]!, note))
      return 0
    }
    case 'escalate': {
      need(1)
      const lane = one('--lane')
      if (lane !== 'batch-review' && lane !== 'owner-sign-off') throw new UsageError('escalate needs --lane batch-review or owner-sign-off.')
      show(escalate(context, positional[0]!, lane))
      return 0
    }
    case 'add-check':
      need(2)
      show(addCheck(context, positional[0]!, positional.slice(1).join(' ')))
      return 0
    case 'accept-check':
      need(2)
      show(acceptCheck(context, positional[0]!, Number(positional[1])))
      return 0
    case 'pr': {
      need(1)
      const preview = one('--preview')
      const line = registerPullRequest(context, { number: Number(positional[0]), ...(preview ? { preview } : {}), ...(one('--remote') ? { remote: one('--remote')! } : {}) })
      print(`${line.id} ${line.status} at ${line.head.slice(0, 12)}${line.previews?.length ? `, served at ${line.previews.map((p) => p.url).join(', ')}` : ''}`)
      return 0
    }
    case 'preview': {
      need(1)
      const bearer = one('--bearer-file')
      const line = registerPreview(context, positional[0]!, bearer ? resolvePath(cwd, bearer) : undefined)
      print(`${line.id} at ${checkout.head} is served at ${new URL(positional[0]!).origin}`)
      return 0
    }
    case 'lines': {
      const document = store.read()
      print(has('--json') ? JSON.stringify({ current: lineIdFor(checkout), lines: document.records.filter((record) => record.kind === 'line') }, null, 2) : renderLines(document, lineIdFor(checkout)))
      return 0
    }
    case 'annotations': {
      const document = store.read()
      const line = one('--line')
      const requests = document.records.filter((record) => record.kind === 'work-request')
      const annotations = document.records
        .filter((record): record is Annotation => record.kind === 'annotation' && (!line || record.seenOn.line === line))
        .map((annotation) => ({ annotation, requests: requests.filter((request) => request.annotationIds.includes(annotation.id)).map((request) => ({ id: request.id, status: request.status, title: request.title })) }))
      print(has('--json') ? JSON.stringify(annotations, null, 2) : annotations.map(({ annotation, requests: linked }) => `${annotation.id}  ${annotation.seenOn.line}  ${annotation.title}${linked.length ? `  [${linked.map((request) => request.status).join(', ')}]` : ''}`).join('\n') || 'No annotations.')
      return 0
    }
    case 'overlay': {
      // A person clicks the overlay, even when an agent started this server.
      const person = identityFromEnv({ ...env, CIVIC_AGENT: undefined }, checkout.root)
      const port = Number(one('--port') ?? 4777)
      const server = createOverlayServer(() => ({ store, checkout: readCheckout(cwd), identity: person }))
      await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
      print(`CIVIC overlay server on http://127.0.0.1:${port} for ${actorId(person)}. Add this to a dev or preview page, never to production:`)
      print(`<script src="http://127.0.0.1:${port}/overlay.js" data-civic-line="${lineIdFor(checkout)}" data-civic-revision="${checkout.head}" defer></script>`)
      await new Promise<void>((resolve) => server.once('close', () => resolve()))
      return 0
    }
    case 'sync': {
      const keyFile = env.CIVIC_SIGNING_KEY ?? gitConfig(checkout.root, 'civic.signingKey')
      const result = sync(context, new GitRefRemote(checkout.root, one('--remote') ?? 'origin', one('--ref') ?? DEFAULT_REF), keyFile ? { signingKey: readKey(resolvePath(checkout.root, keyFile)) } : {})
      if (has('--json')) {
        print(JSON.stringify(result, null, 2))
        return 0
      }
      print(result.revision ? `In sync with ${result.remote} at ${result.revision.slice(0, 12)}: ${result.pulled.length} record(s) from others, ${result.pushed.length} shared.` : `Nothing to share with ${result.remote} yet.`)
      for (const conflict of result.conflicts) print(`Conflict: ${conflict.id} changed here and on ${result.remote}. The shared version is kept; yours is set aside. civic settle ${conflict.id} --keep mine|theirs`)
      return 0
    }
    case 'keygen': {
      // The private key stays on this machine, outside the repository; only the public key is shared.
      const handle = personOf(context.identity)
      const file = resolvePath(cwd, one('--out') ?? join(homedir(), '.config', 'civic', `${handle}.ed25519.pem`))
      const publicKey = generateKey(file)
      git(checkout.root, 'config', 'civic.signingKey', file)
      print(`Wrote your private key to ${file} and set git config civic.signingKey for this repository.`)
      print(`Add your public key to civic.access.json on the default branch, under "keys": { "${handle}": ["${publicKey}"] }`)
      return 0
    }
    case 'conflicts': {
      const conflicts = listConflicts(context)
      print(has('--json') ? JSON.stringify(conflicts, null, 2) : conflicts.map((conflict) => `${conflict.id}  ${conflict.kind}  set aside ${conflict.at}${conflict.kind === 'work-request' ? `  yours: ${(conflict.mine as { status: string }).status}, shared: ${(conflict.theirs as { status: string }).status}` : ''}`).join('\n') || 'No conflicts.')
      return 0
    }
    case 'settle': {
      need(1)
      const keep = one('--keep')
      if (keep !== 'mine' && keep !== 'theirs') throw new UsageError('settle needs --keep mine or --keep theirs.')
      const conflict = settleConflict(context, positional[0]!, keep)
      print(`${conflict.id}: kept ${keep === 'mine' ? 'your version; civic sync shares it' : 'the shared version'}.`)
      return 0
    }
    case 'whoami': {
      const policy = loadAccess(checkout)
      const scopes = [...scopesOf(policy, context.identity)].join(', ') || 'none'
      print(`${actorId(context.identity)} on ${lineIdFor(checkout)} at ${checkout.head}\nStore: ${store.dir}\nScopes: ${scopes}${policy ? ` (${ACCESS_FILE} on ${checkout.defaultBranch})` : ` (no ${ACCESS_FILE} on ${checkout.defaultBranch}, so every scope)`}`)
      return 0
    }
    default:
      throw new UsageError(command ? `Unknown command: ${command}` : '')
  }
}

/** The lens: every line the store knows, with its previews and the open requests on it (D36). */
function renderLines(document: GraphDocument, current: string): string {
  const lines = document.records.filter((record) => record.kind === 'line')
  if (lines.length === 0) return 'No lines yet. Any civic write records the current line.'
  return lines
    .map((line) => {
      const claimed = document.records.filter((record) => record.kind === 'work-request' && record.claim?.line === line.id && record.status !== 'resolved').length
      const previews = (line.previews ?? []).map((preview) => `${preview.url} @ ${preview.revision.slice(0, 7)}`).join(', ')
      return `${line.id === current ? '*' : ' '} ${line.id.padEnd(36)} ${line.type.padEnd(9)} ${line.status.padEnd(9)} ${line.head.slice(0, 7)}${claimed ? `  ${claimed} request(s) claimed` : ''}${previews ? `  ${previews}` : ''}`
    })
    .join('\n')
}

function gitConfig(root: string, key: string): string | undefined {
  try {
    return git(root, 'config', '--get', key) || undefined
  } catch {
    return undefined
  }
}

function parse(args: string[]) {
  const positional: string[] = []
  const flags = new Map<string, string[]>()
  const booleans = new Set(['--change', '--high-risk', '--json', '--no-checks', '--recapture'])
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (!arg.startsWith('--')) positional.push(arg)
    else if (booleans.has(arg)) flags.set(arg, ['true'])
    else {
      const value = args[++index]
      if (value === undefined) throw new UsageError(`${arg} needs a value.`)
      flags.set(arg, [...(flags.get(arg) ?? []), value])
    }
  }
  return { positional, flags, has: (name: string) => flags.has(name) }
}

function parseEdge(value: string): EdgeRef {
  const [from, rest] = value.split('>') as [string, string | undefined]
  if (!from || !rest) throw new UsageError(`An edge is <from-id>><to-id>[:<action>], for example target:a>target:b:Retry. Got ${value}.`)
  // IDs contain one colon each, so an action follows a second colon in the destination part.
  const parts = rest.split(':')
  const to = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : undefined
  const action = parts.length > 2 ? parts.slice(2).join(':') : undefined
  return { from, ...(to ? { to } : {}), ...(action ? { action } : {}) }
}

function parseRect(value: string, label: string | undefined): NonNullable<Annotation['anchor']>['rect'] {
  const numbers = value.split(',').map(Number)
  if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number) || number < 0 || number > 1)) throw new UsageError('A rectangle is x,y,width,height, each between 0 and 1.')
  const [x, y, width, height] = numbers as [number, number, number, number]
  return { x, y, width, height, ...(label ? { label } : {}) }
}

function parseViewport(value: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(value)
  if (!match) throw new UsageError('A viewport is <width>x<height>, such as 393x852.')
  return { width: Number(match[1]), height: Number(match[2]) }
}

function parseOwner(value: string): Owner {
  const [role, who] = value.split(':') as [string, string | undefined]
  if (!who || !(ROLES as readonly string[]).includes(role)) throw new UsageError(`An owner is <role>:<who>, with role one of ${ROLES.join(', ')}. Got ${value}.`)
  return { role: role as Role, who }
}

function mediaOf(file: string): CaptureRef['mediaType'] {
  const media = MEDIA[extname(file).toLowerCase()]
  if (!media) throw new UsageError('Import a PNG, JPEG or WebP screenshot.')
  return media
}

export class UsageError extends Error {}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2))
  } catch (error) {
    if (error instanceof UsageError) {
      if (error.message) console.error(error.message)
      console.error(USAGE)
      process.exitCode = 2
    } else {
      console.error((error as Error).message)
      process.exitCode = 1
    }
  }
}
