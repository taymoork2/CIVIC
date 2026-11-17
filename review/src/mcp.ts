#!/usr/bin/env node
// civic-mcp: the review to agent loop over MCP (decision 0007, D35, D40). The same calls as
// the civic CLI, over stdio JSON-RPC, so any harness that speaks MCP can work CIVIC requests.
// Agents get only D35's narrow write path: read, claim, comment, report a fix, add a check,
// register the pull request they opened, and record an annotation for their person. They can't resolve, accept checks or escalate.
// CIVIC makes no model calls; the agent runs in its own harness.
//
// Environment: CIVIC_AGENT (the harness, default "mcp-agent"), CIVIC_FOR (the person it acts
// for; defaults to the checkout's git identity), CIVIC_REPO (default checkout).
// CIVIC_STORE selects an absolute records folder (created owner-only); otherwise main checkout/.civic.

import { readFileSync, realpathSync, watch } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cause, Effect, Fiber, Queue, Schedule, Schema, Stream } from 'effect'
import { changedScreens, coverage, previewStore, ReviewSessions, type ScreenRef, type Shot } from './coordinator.ts'
import { previewsDir, privateDir } from './preview/state.ts'
import { contextFor, gapsIn, loadGraph, renderGaps, renderWorkOrder, PLATFORMS, type Annotation, type CaptureRef, type Platform, type RequestStatus } from '../../graph/src/index.ts'
import { readCheckout } from './git.ts'
import { identityFromEnv } from './identity.ts'
import { addCheck, annotate, claim, comment, find, getRequest, linkRequest, listRequests, lineIdFor, registerPullRequest, release, reportFix, type Context } from './loop.ts'
import type { WorkRef } from '../../graph/src/index.ts'
import { recapture, reproductionUrl } from './recapture.ts'
import { renderList, renderRequest } from './render.ts'
import { elements, type TaggedCapture } from './elements.ts'
import { readBackendCoverage } from './backend.ts'
import { configuredStore, Store } from './store.ts'

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
type Args = Record<string, unknown>
const workRef = Schema.Struct({ system: Schema.NonEmptyString, id: Schema.NonEmptyString, url: Schema.optionalKey(Schema.NonEmptyString) })
const sessions = new ReviewSessions()
const screenRef = Schema.Struct({ project: Schema.NonEmptyString, scenario: Schema.NonEmptyString, journey: Schema.optionalKey(Schema.String), route: Schema.optionalKey(Schema.String) })

const cwdProperty = { cwd: Schema.optionalKey(Schema.String.annotate({ description: 'The checkout (worktree) you are working in. Its branch is the line your claims and fixes are recorded on.' })) }
const id = { id: Schema.NonEmptyString.annotate({ description: 'Work request ID, or a unique prefix of it. End it with @<version>, as list_requests prints it, so a write is refused if someone changed the request since you read it.' }) }

type Tool = { name: string; description: string; schema: Schema.ConstraintDecoder<Args>; run: (helpers: ReturnType<typeof toolContext>) => Promise<Content[]> }

export const TOOLS: readonly Tool[] = [
  { name: 'changed_screens', description: 'Screens and journeys rendered by changed source lines, with missing capture limits.', schema: Schema.Struct({ cwd: Schema.NonEmptyString, base: Schema.NonEmptyString, project: Schema.optionalKey(Schema.NonEmptyString) }), run: async ({ need, text, str }) => text(JSON.stringify(await changedScreens(need('cwd'), need('base'), str('project')))) },
  { name: 'coverage', description: 'Current screen, journey and backend coverage.', schema: Schema.Struct({ ...cwdProperty, project: Schema.optionalKey(Schema.String) }), run: async ({ str, env, text }) => text(JSON.stringify(await coverage(str('cwd') ?? env.CIVIC_REPO ?? process.cwd(), str('project')))) },
{ name: 'open_review', description: 'Open this worktree for its owner to review, linked to an outside work item.', schema: Schema.Struct({ cwd: Schema.NonEmptyString, workRef, preview_url: Schema.optionalKey(Schema.NonEmptyString), screens: Schema.optionalKey(Schema.Array(screenRef)), shots: Schema.optionalKey(Schema.Array(Schema.Struct({ viewport: Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 4000 })), theme: Schema.Literals(['light', 'dark']) }))) }), run: async ({ args, need, env, text }) => text(JSON.stringify(await sessions.open(need('cwd'), args.workRef as WorkRef, env, args.screens as ScreenRef[] | undefined, args.shots as Shot[] | undefined, args.preview_url as string | undefined))) },
  { name: 'close_review', description: 'Close only a review session this coordinator opened.', schema: Schema.Struct({ id: Schema.NonEmptyString }), run: async ({ need, text }) => { await sessions.close(need('id')); return text('Review closed.') } },
  { name: 'list_requests', description: 'List CIVIC work requests with status, lane and claim holder. Open and reopened requests are claimable.', schema: Schema.Struct({ ...cwdProperty, workRef: Schema.optionalKey(workRef), status: Schema.optionalKey(Schema.Array(Schema.Literals(['open', 'claimed', 'fix-ready', 'resolved', 'reopened']))) }), run: async ({ args, context, text }) => {
    const status = Array.isArray(args.status) ? (args.status as RequestStatus[]) : undefined
    const c = context()
    return text(`You are on ${lineIdFor(c.checkout)}.\n${renderList(listRequests(c, { ...(status ? { status } : {}), ...(args.workRef ? { workRef: args.workRef as WorkRef } : {}) }))}`)
  } },
  { name: 'link_request', description: 'Add an external work reference to a request at id@version. This changes no review outcome.', schema: Schema.Struct({ ...cwdProperty, ...id, workRef }), run: async ({ args, context, need, text }) => {
    return text(JSON.stringify(linkRequest(context(), need('id'), args.workRef as WorkRef)))
  } },
  { name: 'get_request', description: 'Read one work request as a work order: the ask, annotations with anchors and their frozen captures (as images), where it was seen, how to reproduce it, acceptance, fixes and comments. Pass graph to include the civic context export.', schema: Schema.Struct({ ...cwdProperty, ...id, graph: Schema.optionalKey(Schema.String.annotate({ description: 'Path to a CIVIC graph file for the contract export.' })) }), run: async ({ context, str, need, text }) => {
    const c = context()
    const summary = getRequest(c, need('id'))
    const document = c.store.read()
    const graph = str('graph')
    const out: Content[] = text(renderRequest(document, summary, { store: c.store, ...(graph ? { graph: await loadGraph(graph) } : {}) }))
    for (const annotationId of summary.request.annotationIds) {
      const capture = find<Annotation>(document, annotationId, 'annotation').capture
      if (!capture) continue
      try {
        out.push({ type: 'text', text: `Frozen capture of ${annotationId}:` }, { type: 'image', data: readFileSync(c.store.capturePath(capture)).toString('base64'), mimeType: MEDIA[capture.mediaType] })
      } catch {
        out.push({ type: 'text', text: `The capture of ${annotationId} is missing from the store.` })
      }
    }
    return out
  } },
  { name: 'claim', description: 'Claim a work request for your line. A claim is a lease (default 120 minutes) you can renew by claiming again. A request claimed by someone else is refused, naming the holder.', schema: Schema.Struct({ ...cwdProperty, ...id, lease_minutes: Schema.optionalKey(Schema.Number) }), run: async ({ args, context, need, text }) => {
    const request = claim(context(), need('id'), typeof args.lease_minutes === 'number' ? args.lease_minutes : undefined)
    return text(`${request.id} claimed by ${request.claim!.by} on ${request.claim!.line} until ${request.claim!.expires}.`)
  } },
  { name: 'release', description: 'Give your claim back so another agent can take the request.', schema: Schema.Struct({ ...cwdProperty, ...id }), run: async ({ context, need, text }) => {
    return text(`${release(context(), need('id')).id} released.`)
  } },
  { name: 'comment', description: 'Ask a question or explain a choice on a work request. People see it on the request.', schema: Schema.Struct({ ...cwdProperty, ...id, text: Schema.NonEmptyString }), run: async ({ context, need, text }) => {
    return text(`Comment added to ${comment(context(), need('id'), need('text')).id}.`)
  } },
  { name: 'repro', description: 'The URLs that open each annotation\'s exact scenario on a preview, such as your worktree\'s dev server.', schema: Schema.Struct({ ...cwdProperty, ...id, url: Schema.NonEmptyString.annotate({ description: 'The preview origin, for example http://127.0.0.1:3011.' }) }), run: async ({ context, need, text }) => {
    const c = context()
    const document = c.store.read()
    const { request } = getRequest(c, need('id'))
    return text(request.annotationIds.map((annotationId) => { const annotation = find<Annotation>(document, annotationId, 'annotation'); return `${reproductionUrl(annotation, need('url'))}  ${annotation.title}` }).join('\n'))
  } },
  { name: 'report_fix', description: 'Report a fix as ready, with the preview that serves it (commit first: the revision is your checkout\'s HEAD). This only moves the request to Fix ready for review. CIVIC then re-captures the scenario on the preview; in the Auto lane it resolves or reopens the request, otherwise a person reviews it. You never resolve requests.', schema: Schema.Struct({ ...cwdProperty, ...id, preview: Schema.optionalKey(Schema.String), note: Schema.optionalKey(Schema.String) }), run: async ({ context, str, need, text }) => {
    const c = context()
    const preview = str('preview')
    const note = str('note')
    const request = reportFix(c, need('id'), { ...(preview ? { preview } : {}), ...(note ? { note } : {}) })
    if (!preview) return text(`${request.id} is Fix ready for review. With no preview, CIVIC can't re-capture it; a person reviews it.`)
    // CIVIC's own deterministic re-capture, written as actor:civic, never as the agent.
    try {
      const result = await recapture(c, request.id)
      const anchors = result.recapture.anchors.map((anchor) => `${anchor.annotationId}: ${anchor.outcome}`).join('\n')
      const checks = result.recapture.checks.map((check) => `${check.outcome} ${check.command}`).join('\n')
      return text(`${request.id} is now ${result.request.status}.\n${anchors}${checks ? `\n${checks}` : ''}`)
    } catch (error) {
      return text(`${request.id} is Fix ready for review. CIVIC's re-capture did not run: ${(error as Error).message} Run civic recapture ${request.id} once the preview is up.`)
    }
  } },
  { name: 'register_pr', description: 'After opening a pull request, record it as its own line with the preview that serves its head, so annotations made on that preview land on the PR and fixes can be re-captured there. Run it again when the PR moves.', schema: Schema.Struct({ ...cwdProperty, number: Schema.Number, preview: Schema.optionalKey(Schema.String.annotate({ description: 'The hosted preview URL for the PR, if it has one.' })), remote: Schema.optionalKey(Schema.String.annotate({ description: 'The git remote hosting the PR. Default origin.' })) }), run: async ({ args, context, str, text }) => {
    if (typeof args.number !== 'number') fail('number is required.')
    const preview = str('preview')
    const remote = str('remote')
    const line = registerPullRequest(context(), { number: args.number as number, ...(preview ? { preview } : {}), ...(remote ? { remote } : {}) })
    return text(`${line.id} is ${line.status} at ${line.head}${line.previews?.length ? `, served at ${line.previews.map((p) => p.url).join(', ')}` : ''}.`)
  } },
  { name: 'add_check', description: 'Add an acceptance check command. It counts toward the Auto lane only after a person accepts it.', schema: Schema.Struct({ ...cwdProperty, ...id, command: Schema.NonEmptyString }), run: async ({ context, need, text }) => {
    return text(`Check added to ${addCheck(context(), need('id'), need('command')).id}. It counts toward Auto once a person accepts it.`)
  } },
  { name: 'annotate', description: 'Record an annotation for your person, for example from a screenshot they pasted. Without target_ids or a locator it is unanchored.', schema: Schema.Struct({ ...cwdProperty, comment: Schema.NonEmptyString, url: Schema.optionalKey(Schema.String), line: Schema.optionalKey(Schema.String.annotate({ description: 'A line CIVIC knows, such as a design draft (civic lines), annotated at its latest revision.' })), figma_node: Schema.optionalKey(Schema.String.annotate({ description: "A design line's frame or layer, by its node ID in the design tool (a Figma node ID, or a frame's node in a civic.design/0 file)." })), role: Schema.optionalKey(Schema.String), name: Schema.optionalKey(Schema.String), test_id: Schema.optionalKey(Schema.String), image_base64: Schema.optionalKey(Schema.String), target_ids: Schema.optionalKey(Schema.Array(Schema.String)), media_type: Schema.optionalKey(Schema.Literals(['image/png', 'image/jpeg', 'image/webp'])) }), run: async ({ args, context, str, need, text }) => {
    const image = str('image_base64')
    const role = str('role')
    const testId = str('test_id')
    const url = str('url')
    const line = str('line')
    const figmaNode = str('figma_node')
    const annotation = annotate(context(), {
      comment: need('comment'),
      targetIds: Array.isArray(args.target_ids) ? (args.target_ids as string[]) : [],
      ...(testId || role || figmaNode ? { locator: { ...(testId ? { testId } : {}), ...(role ? { role, name: need('name') } : {}), ...(figmaNode ? { figmaNode } : {}) } } : {}),
      ...(line ? { line } : {}),
      ...(image ? { image: { bytes: Buffer.from(image, 'base64'), mediaType: (str('media_type') ?? 'image/png') as CaptureRef['mediaType'] } } : {}),
      ...(url ? { url } : {}),
    })
    return text(`${annotation.id} recorded for ${annotation.writtenBy}${annotation.anchor ? '' : ', unanchored'}.`)
  } },
  { name: 'context', description: 'The civic context export (D31): one component variant\'s contract as a work order.', schema: Schema.Struct({ graph: Schema.NonEmptyString, semantic_id: Schema.NonEmptyString, platform: Schema.Literals(PLATFORMS), variant: Schema.optionalKey(Schema.String) }), run: async ({ str, need, text }) => {
    const platform = need('platform')
    if (!(PLATFORMS as readonly string[]).includes(platform)) fail(`Unknown platform ${platform}.`)
    const variant = str('variant')
    return text(renderWorkOrder(contextFor(await loadGraph(need('graph')), need('semantic_id'), { platform: platform as Platform, ...(variant ? { variant } : {}) })))
  } },
  { name: 'gaps', description: 'What a graph expects but is missing, with owners (D31).', schema: Schema.Struct({ graph: Schema.NonEmptyString, scope: Schema.optionalKey(Schema.String), platform: Schema.optionalKey(Schema.Literals(PLATFORMS)) }), run: async ({ str, need, text }) => {
    const platform = str('platform')
    const scope = str('scope')
    return text(renderGaps(gapsIn(await loadGraph(need('graph')), { ...(scope ? { scope } : {}), ...(platform ? { platform: platform as Platform } : {}) })))
  } },
  { name: 'elements', description: 'The captured elements a source file renders, optionally only those from a line range, with their scenario. Use it to see which screens a change touches.', schema: Schema.Struct({ ...cwdProperty, file: Schema.NonEmptyString.annotate({ description: 'Repository-relative source file, for example packages/canvas/src/review-panel.tsx.' }), from: Schema.optionalKey(Schema.Int), to: Schema.optionalKey(Schema.Int), captures: Schema.NonEmptyString.annotate({ description: 'A tagged-captures JSON file, as civic elements --capture reads.' }) }), run: async ({ args, str, need, text }) => {
    const lines = typeof args.from === 'number' ? [args.from, typeof args.to === 'number' ? args.to : args.from] as const : undefined
    const captures = JSON.parse(readFileSync(resolve(str('cwd') ?? process.cwd(), need('captures')), 'utf8')) as TaggedCapture[]
    return text(JSON.stringify(elements(captures, need('file'), lines), null, 2))
  } },
  { name: 'backend_coverage', description: 'The server routes, handlers and RPCs each journey\'s passing replays reach, and the ones no journey reaches.', schema: Schema.Struct({ ...cwdProperty, project: Schema.optionalKey(Schema.String), store: Schema.optionalKey(Schema.String), data_dir: Schema.optionalKey(Schema.String) }), run: async ({ str, text, env }) => {
    return text(JSON.stringify(await readBackendCoverage(str('cwd') ?? env.CIVIC_REPO ?? process.cwd(), str('project'), str('store'), str('data_dir')), null, 2))
  } },
]

const MEDIA: Record<CaptureRef['mediaType'], string> = { 'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/webp': 'image/webp' }

const toolContext = (args: Args, env: NodeJS.ProcessEnv) => {
  const str = (key: string) => (typeof args[key] === 'string' && args[key] !== '' ? (args[key] as string) : undefined)
  const need = (key: string) => str(key) ?? fail(`${key} is required.`)
  const context = (): Context => {
    const checkout = readCheckout(str('cwd') ?? env.CIVIC_REPO ?? process.cwd())
    return { store: Store.forCheckout(checkout, env), checkout, identity: identityFromEnv({ ...env, CIVIC_AGENT: env.CIVIC_AGENT || 'mcp-agent' }, checkout.root) }
  }
  const text = (value: string): Content[] => [{ type: 'text', text: value }]

  return { args, str, need, context, text, env }
}

export async function callTool(name: string, args: Args, env: NodeJS.ProcessEnv = process.env): Promise<Content[]> {
  const tool = TOOLS.find((tool) => tool.name === name)
  if (!tool) return fail(`Unknown tool ${name}.`)
  for (const [field, value] of Object.entries(args)) {
    const limit = field === 'image_base64' ? 8 * 1024 * 1024 : 64 * 1024
    if (typeof value === 'string' && Buffer.byteLength(value) > limit) fail(`${field} exceeds ${limit} bytes.`)
  }
  const decoded = Schema.decodeUnknownSync(tool.schema)(args)
  return tool.run(toolContext(decoded, env))
}

function fail(message: string): never {
  throw new Error(message)
}

interface Message { jsonrpc: '2.0'; id?: number | string; method: string; params?: Record<string, unknown> }

/** Handles one JSON-RPC message; returns the response, or undefined for a notification. */
export async function handle(message: Message, env: NodeJS.ProcessEnv = process.env): Promise<object | undefined> {
  const reply = (result: object) => ({ jsonrpc: '2.0', id: message.id, result })
  switch (message.method) {
    case 'initialize':
      return reply({
        protocolVersion: typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : '2025-06-18',
        capabilities: { tools: {}, resources: { subscribe: true } },
        serverInfo: { name: 'civic', version: '0.1.0' },
        instructions: 'CIVIC work requests: list_requests, get_request, claim, repro, fix and commit, then report_fix with your preview. You never resolve requests; CIVIC and people do.',
      })
    case 'ping':
      return reply({})
    case 'resources/list': {
      const resources = new Map<string, { uri: string; name: string; mimeType: string }>()
      for (const row of listRequests(toolContext({}, env).context())) for (const link of row.request.links ?? []) {
        const uri = `civic://requests?${new URLSearchParams({ system: link.system, id: link.id })}`
        resources.set(uri, { uri, name: `${link.system}: ${link.id}`, mimeType: 'application/json' })
      }
      return reply({ resources: [...resources.values()] })
    }
    case 'resources/templates/list':
      return reply({ resourceTemplates: [{ uriTemplate: 'civic://requests?system={system}&id={id}', name: 'Work item requests' }, { uriTemplate: 'civic://coverage/{project}', name: 'Project coverage' }] })
    case 'resources/read': {
      try {
        const uri = String(message.params?.uri ?? '')
        return reply({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await readResource(uri, env)) }] })
      } catch (error) { return { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: String(error) } } }
    }
    case 'tools/list':
      return reply({ tools: TOOLS.map(({ name, description, schema }) => ({ name, description, inputSchema: Schema.toJsonSchemaDocument(schema).schema })) })
    case 'tools/call': {
      const name = String(message.params?.name ?? '')
      try {
        return reply({ content: await callTool(name, (message.params?.arguments ?? {}) as Args, env) })
      } catch (error) {
        return reply({ content: [{ type: 'text', text: (error as Error).message }], isError: true })
      }
    }
    default:
      if (message.id === undefined) return undefined
      return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } }
  }
}

export const serve = () => Effect.scoped(Effect.gen(function* () {
  configuredStore()
  const subscriptions = new Map<string, Fiber.Fiber<void, unknown>>()
  yield* Effect.addFinalizer(() => Fiber.interruptAll(subscriptions.values()))
  yield* Effect.addFinalizer(() => Effect.promise(() => sessions.closeAll()))
  yield* Effect.addFinalizer(() => Effect.sync(() => process.stdin.destroy()))
  process.stdin.setEncoding('utf8')
  let shutdown = false
  let lineBytes = 0
  const lines = Stream.fromAsyncIterable(process.stdin, (error) => error).pipe(
    Stream.map((chunk: string) => {
      for (const char of chunk) {
        lineBytes = char === '\n' ? 0 : lineBytes + Buffer.byteLength(char)
        if (lineBytes > 16 * 1024 * 1024) fail('MCP line exceeds 16 MiB.')
      }
      return chunk
    }),
    Stream.splitLines,
  )
  yield* Stream.runForEach(lines, (line) => Effect.gen(function* () {
    yield* Effect.promise(async () => {
    if (!line.trim()) return
    let message: Message
    try {
      message = JSON.parse(line) as Message
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`)
      return
    }
    let response: object | undefined
    if (shutdown) {
      if (message.id !== undefined) response = { jsonrpc: '2.0', id: message.id, error: { code: -32600, message: 'Server is shut down.' } }
    } else if (message.method === 'shutdown') {
      shutdown = true
      if (message.id !== undefined) response = { jsonrpc: '2.0', id: message.id, result: {} }
    } else if (message.method === 'resources/subscribe' || message.method === 'resources/unsubscribe') {
      const uri = String(message.params?.uri ?? '')
      try {
        resourceKind(uri)
        const previous = subscriptions.get(uri)
        if (previous) await Effect.runPromise(Fiber.interrupt(previous))
        subscriptions.delete(uri)
        if (message.method === 'resources/subscribe') {
          const cwd = process.env.CIVIC_REPO ?? process.cwd()
          const store = Store.forCheckout(readCheckout(cwd))
          store.ensure()
          const changes = Stream.callback<void>(queue => Effect.acquireRelease(
            Effect.sync(() => {
              privateDir(previewsDir())
              const notify = () => Queue.offerUnsafe(queue, undefined)
              const failed = (error: unknown) => { Queue.failCauseUnsafe(queue, Cause.die(error)) }
              const records = watch(store.dir, { recursive: true }, (_event, filename) => {
                if (filename && !String(filename).endsWith('.tmp')) notify()
              }).on('error', failed)
              let root = '', preview: ReturnType<typeof watch> | undefined
              const refresh = () => {
                const next = previewStore(cwd)
                if (next === root) return
                preview?.close()
                root = next
                preview = next === cwd ? undefined : watch(next, { recursive: true }, (_event, filename) => {
                  if (filename && String(filename).split('/').includes('replays') && !String(filename).endsWith('.tmp')) notify()
                }).on('error', failed)
                notify()
              }
              const registrations = watch(previewsDir(), () => {
                try { refresh() } catch (error) { failed(error) }
              }).on('error', failed)
              try { refresh() } catch (error) { records.close(); registrations.close(); throw error }
              return () => { records.close(); registrations.close(); preview?.close() }
            }),
            close => Effect.sync(close),
          ), { bufferSize: 1, strategy: 'sliding' })
          const fiber = yieldSubscription(changes, uri)
          subscriptions.set(uri, fiber)
        }
        response = { jsonrpc: '2.0', id: message.id, result: {} }
      } catch (error) { response = { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: String(error) } } }
    } else if (message.id !== undefined) response = await handle(message)
    if (response) await new Promise<void>((resolve, reject) => process.stdout.write(`${JSON.stringify(response)}\n`, (error) => error ? reject(error) : resolve()))
    })
  }))
  yield* Fiber.interruptAll(subscriptions.values())
}))

function resourceKind(uri: string) {
  const url = new URL(uri)
  if (url.protocol !== 'civic:') fail('Unknown resource.')
  if (url.hostname === 'requests' && url.searchParams.get('system') && url.searchParams.get('id')) return url
  if (url.hostname === 'coverage' && url.pathname.length > 1) return url
  return fail('Unknown resource.')
}

async function readResource(uri: string, env: NodeJS.ProcessEnv) {
  const url = resourceKind(uri)
  const cwd = env.CIVIC_REPO ?? process.cwd()
  if (url.hostname === 'coverage') return coverage(cwd, decodeURIComponent(url.pathname.slice(1)))
  return listRequests(toolContext({}, env).context(), { workRef: { system: url.searchParams.get('system')!, id: url.searchParams.get('id')! } })
}

function yieldSubscription(changes: Stream.Stream<void>, uri: string) {
  const debounce = Schedule.recurs(1).pipe(Schedule.addDelay(() => Effect.succeed('75 millis')))
  return Effect.runFork(Stream.runForEach(changes.pipe(Stream.switchMap(() => Stream.fromEffect(Effect.schedule(Effect.void, debounce)))), () => Effect.sync(() => {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/resources/updated', params: { uri } })}\n`)
  })))
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Effect.runPromise(serve()).catch((error) => {
    process.stderr.write(`${String(error)}\n`)
    process.exitCode = 1
  })
}
