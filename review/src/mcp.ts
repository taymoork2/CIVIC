#!/usr/bin/env node
// civic-mcp: the review to agent loop over MCP (decision 0007, D35, D40). The same calls as
// the civic CLI, over stdio JSON-RPC, so any harness that speaks MCP can work CIVIC requests.
// Agents get only D35's narrow write path: read, claim, comment, report a fix, add a check,
// register the pull request they opened, and record an annotation for their person. They can't resolve, accept checks or escalate.
// CIVIC makes no model calls; the agent runs in its own harness.
//
// Environment: CIVIC_AGENT (the harness, default "mcp-agent"), CIVIC_FOR (the person it acts
// for; defaults to the checkout's git identity), CIVIC_REPO (default checkout).

import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { contextFor, gapsIn, loadGraph, renderGaps, renderWorkOrder, PLATFORMS, type Annotation, type CaptureRef, type Platform, type RequestStatus } from '../../graph/src/index.ts'
import { readCheckout } from './git.ts'
import { identityFromEnv } from './identity.ts'
import { addCheck, annotate, claim, comment, find, getRequest, listRequests, lineIdFor, registerPullRequest, release, reportFix, type Context } from './loop.ts'
import { recapture, reproductionUrl } from './recapture.ts'
import { renderList, renderRequest } from './render.ts'
import { Store } from './store.ts'

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
type Args = Record<string, unknown>

const cwdProperty = { cwd: { type: 'string', description: 'The checkout (worktree) you are working in. Its branch is the line your claims and fixes are recorded on.' } }
const id = { id: { type: 'string', description: 'Work request ID, or a unique prefix of it. End it with @<version>, as list_requests prints it, so a write is refused if someone changed the request since you read it.' } }

export const TOOLS = [
  { name: 'list_requests', description: 'List CIVIC work requests with status, lane and claim holder. Open and reopened requests are claimable.', inputSchema: { type: 'object', properties: { ...cwdProperty, status: { type: 'array', items: { type: 'string', enum: ['open', 'claimed', 'fix-ready', 'resolved', 'reopened'] } } } } },
  { name: 'get_request', description: 'Read one work request as a work order: the ask, annotations with anchors and their frozen captures (as images), where it was seen, how to reproduce it, acceptance, fixes and comments. Pass graph to include the civic context export.', inputSchema: { type: 'object', properties: { ...cwdProperty, ...id, graph: { type: 'string', description: 'Path to a CIVIC graph file for the contract export.' } }, required: ['id'] } },
  { name: 'claim', description: 'Claim a work request for your line. A claim is a lease (default 120 minutes) you can renew by claiming again. A request claimed by someone else is refused, naming the holder.', inputSchema: { type: 'object', properties: { ...cwdProperty, ...id, lease_minutes: { type: 'number' } }, required: ['id'] } },
  { name: 'release', description: 'Give your claim back so another agent can take the request.', inputSchema: { type: 'object', properties: { ...cwdProperty, ...id }, required: ['id'] } },
  { name: 'comment', description: 'Ask a question or explain a choice on a work request. People see it on the request.', inputSchema: { type: 'object', properties: { ...cwdProperty, ...id, text: { type: 'string' } }, required: ['id', 'text'] } },
  { name: 'repro', description: 'The URLs that open each annotation\'s exact scenario on a preview, such as your worktree\'s dev server.', inputSchema: { type: 'object', properties: { ...cwdProperty, ...id, url: { type: 'string', description: 'The preview origin, for example http://127.0.0.1:3011.' } }, required: ['id', 'url'] } },
  { name: 'report_fix', description: 'Report a fix as ready, with the preview that serves it (commit first: the revision is your checkout\'s HEAD). This only moves the request to Fix ready for review. CIVIC then re-captures the scenario on the preview; in the Auto lane it resolves or reopens the request, otherwise a person reviews it. You never resolve requests.', inputSchema: { type: 'object', properties: { ...cwdProperty, ...id, preview: { type: 'string' }, note: { type: 'string' } }, required: ['id'] } },
  { name: 'register_pr', description: 'After opening a pull request, record it as its own line with the preview that serves its head, so annotations made on that preview land on the PR and fixes can be re-captured there. Run it again when the PR moves.', inputSchema: { type: 'object', properties: { ...cwdProperty, number: { type: 'number' }, preview: { type: 'string', description: 'The hosted preview URL for the PR, if it has one.' }, remote: { type: 'string', description: 'The git remote hosting the PR. Default origin.' } }, required: ['number'] } },
  { name: 'add_check', description: 'Add an acceptance check command. It counts toward the Auto lane only after a person accepts it.', inputSchema: { type: 'object', properties: { ...cwdProperty, ...id, command: { type: 'string' } }, required: ['id', 'command'] } },
  { name: 'annotate', description: 'Record an annotation for your person, for example from a screenshot they pasted. Without target_ids or a locator it is unanchored.', inputSchema: { type: 'object', properties: { ...cwdProperty, comment: { type: 'string' }, url: { type: 'string' }, target_ids: { type: 'array', items: { type: 'string' } }, role: { type: 'string' }, name: { type: 'string' }, test_id: { type: 'string' }, image_base64: { type: 'string' }, media_type: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'] } }, required: ['comment'] } },
  { name: 'context', description: 'The civic context export (D31): one component variant\'s contract as a work order.', inputSchema: { type: 'object', properties: { graph: { type: 'string' }, semantic_id: { type: 'string' }, platform: { type: 'string', enum: [...PLATFORMS] }, variant: { type: 'string' } }, required: ['graph', 'semantic_id', 'platform'] } },
  { name: 'gaps', description: 'What a graph expects but is missing, with owners (D31).', inputSchema: { type: 'object', properties: { graph: { type: 'string' }, scope: { type: 'string' }, platform: { type: 'string', enum: [...PLATFORMS] } }, required: ['graph'] } },
] as const

const MEDIA: Record<CaptureRef['mediaType'], string> = { 'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/webp': 'image/webp' }

export async function callTool(name: string, args: Args, env: NodeJS.ProcessEnv = process.env): Promise<Content[]> {
  const str = (key: string) => (typeof args[key] === 'string' && args[key] !== '' ? (args[key] as string) : undefined)
  const need = (key: string) => str(key) ?? fail(`${key} is required.`)
  const context = (): Context => {
    const checkout = readCheckout(str('cwd') ?? env.CIVIC_REPO ?? process.cwd())
    return { store: Store.forCommonDir(checkout.commonDir), checkout, identity: identityFromEnv({ ...env, CIVIC_AGENT: env.CIVIC_AGENT || 'mcp-agent' }, checkout.root) }
  }
  const text = (value: string): Content[] => [{ type: 'text', text: value }]

  switch (name) {
    case 'list_requests': {
      const status = Array.isArray(args.status) ? (args.status as RequestStatus[]) : undefined
      const c = context()
      return text(`You are on ${lineIdFor(c.checkout)}.\n${renderList(listRequests(c, status ? { status } : {}))}`)
    }
    case 'get_request': {
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
    }
    case 'claim': {
      const request = claim(context(), need('id'), typeof args.lease_minutes === 'number' ? args.lease_minutes : undefined)
      return text(`${request.id} claimed by ${request.claim!.by} on ${request.claim!.line} until ${request.claim!.expires}.`)
    }
    case 'release':
      return text(`${release(context(), need('id')).id} released.`)
    case 'comment':
      return text(`Comment added to ${comment(context(), need('id'), need('text')).id}.`)
    case 'repro': {
      const c = context()
      const document = c.store.read()
      const { request } = getRequest(c, need('id'))
      return text(request.annotationIds.map((annotationId) => { const annotation = find<Annotation>(document, annotationId, 'annotation'); return `${reproductionUrl(annotation, need('url'))}  ${annotation.title}` }).join('\n'))
    }
    case 'report_fix': {
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
    }
    case 'register_pr': {
      if (typeof args.number !== 'number') fail('number is required.')
      const preview = str('preview')
      const remote = str('remote')
      const line = registerPullRequest(context(), { number: args.number as number, ...(preview ? { preview } : {}), ...(remote ? { remote } : {}) })
      return text(`${line.id} is ${line.status} at ${line.head}${line.previews?.length ? `, served at ${line.previews.map((p) => p.url).join(', ')}` : ''}.`)
    }
    case 'add_check':
      return text(`Check added to ${addCheck(context(), need('id'), need('command')).id}. It counts toward Auto once a person accepts it.`)
    case 'annotate': {
      const image = str('image_base64')
      const role = str('role')
      const testId = str('test_id')
      const url = str('url')
      const annotation = annotate(context(), {
        comment: need('comment'),
        targetIds: Array.isArray(args.target_ids) ? (args.target_ids as string[]) : [],
        ...(testId || role ? { locator: { ...(testId ? { testId } : {}), ...(role ? { role, name: need('name') } : {}) } } : {}),
        ...(image ? { image: { bytes: Buffer.from(image, 'base64'), mediaType: (str('media_type') ?? 'image/png') as CaptureRef['mediaType'] } } : {}),
        ...(url ? { url } : {}),
      })
      return text(`${annotation.id} recorded for ${annotation.writtenBy}${annotation.anchor ? '' : ', unanchored'}.`)
    }
    case 'context': {
      const platform = need('platform')
      if (!(PLATFORMS as readonly string[]).includes(platform)) fail(`Unknown platform ${platform}.`)
      const variant = str('variant')
      return text(renderWorkOrder(contextFor(await loadGraph(need('graph')), need('semantic_id'), { platform: platform as Platform, ...(variant ? { variant } : {}) })))
    }
    case 'gaps': {
      const platform = str('platform')
      const scope = str('scope')
      return text(renderGaps(gapsIn(await loadGraph(need('graph')), { ...(scope ? { scope } : {}), ...(platform ? { platform: platform as Platform } : {}) })))
    }
    default:
      return fail(`Unknown tool ${name}.`)
  }
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
        capabilities: { tools: {} },
        serverInfo: { name: 'civic', version: '0.1.0' },
        instructions: 'CIVIC work requests: list_requests, get_request, claim, repro, fix and commit, then report_fix with your preview. You never resolve requests; CIVIC and people do.',
      })
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: TOOLS })
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

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lines = createInterface({ input: process.stdin })
  lines.on('line', (line) => {
    if (!line.trim()) return
    let message: Message
    try {
      message = JSON.parse(line) as Message
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`)
      return
    }
    void handle(message).then((response) => {
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
    })
  })
}
