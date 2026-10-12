import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

export const version = 'manufacturer-capture-v1'
export const limits = Object.freeze({ timeoutMs: 8000, totalMs: 30000, maxBytes: 1048576, maxAttempts: 2, maxRedirects: 3, maxRetryMs: 5000 })
// Exact public manufacturer hosts already referenced in the authored evidence packet.
const hosts = new Set(['smartlabel.pg.com', 'tide.com', 'downy.com', 'rbnainfo.com', 'churchdwight.com', 'www.oxiclean.com', 'oxiclean.com', 'www.nehemiahmfg.com', 'qr.whirlpool.com'])
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (code) => { throw Object.assign(new Error(code), { code }) }

export function manufacturerUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2000 || /[\s\\#]/.test(raw)) fail('invalid_url')
  let url
  try { url = new URL(raw) } catch { fail('invalid_url') }
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.port || url.username || url.password || url.hash) fail('invalid_url')
  let path
  try { path = decodeURIComponent(url.pathname) } catch { fail('invalid_url') }
  if (/(?:login|sign[-_]?in|oauth|account|admin|token|secret|password|api[-_]?key)/i.test(path)) fail('access_gate_url')
  const query = { productLineId: /^\d{1,12}$/, portfolio: /^[a-z0-9-]{1,80}$/, fmt: /^png-alpha$/ }
  for (const [key, value] of url.searchParams) if (!Object.hasOwn(query, key) || !query[key].test(value) || url.searchParams.getAll(key).length !== 1) fail('invalid_query')
  return url
}

export function publicIpv4(address) {
  if (isIP(address) !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
}

async function deadline(operation, ms, parent) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(Object.assign(new Error('timeout'), { code: 'timeout' })), ms)
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal
  let abort
  try {
    return await Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return operation(signal) }), new Promise((_, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })])
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}

// DNS is checked on every hop and pinned in the socket lookup, preserving TLS host validation.
export async function httpsSource(url, signal, resolveDns = lookup, connect = request) {
  const addresses = await resolveDns(url.hostname, { family: 4, all: true })
  signal.throwIfAborted()
  if (!addresses.length || addresses.some(({ address }) => !publicIpv4(address))) fail('nonpublic_dns')
  return new Promise((accept, reject) => {
    const req = connect(url, { agent: false, signal, family: 4, maxHeaderSize: 16384,
      lookup: (_host, options, callback) => callback(null, ...(options.all ? [[{ address: addresses[0].address, family: 4 }]] : [addresses[0].address, 4])),
      headers: { 'User-Agent': 'WashCloset-public-source-capture/1', Accept: 'text/html,application/json,text/plain,application/pdf', 'Accept-Encoding': 'identity' },
    }, (res) => accept({ status: res.statusCode, headers: new Headers(Object.entries(res.headers).filter(([, value]) => value !== undefined).map(([name, value]) => [name, String(value)])), body: res }))
    req.on('error', reject)
    req.end()
  })
}

export function retryDelay(value, now) {
  if (value === null) return 500
  if (/^\d+$/.test(value.trim())) return Math.min(Number(value) * 1000, Number.MAX_SAFE_INTEGER)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : null
}

function inspect(bytes, type, complete) {
  if (!complete) return 'incomplete'
  if (!bytes.length) return 'empty_body'
  if (type === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-' ? 'not_extracted' : 'invalid_pdf'
  if (!['text/html', 'application/xhtml+xml', 'text/plain', 'application/json'].includes(type)) return 'unsupported_type'
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return 'invalid_utf8' }
  if (/<input\b[^>]*\btype\s*=\s*["']?password\b|<title\b[^>]*>\s*(?:sign\s*in|log\s*in|access denied|just a moment|captcha)/i.test(text)) return 'access_gate'
  if (type === 'application/json') { try { JSON.parse(text) } catch { return 'invalid_json' } }
  return 'not_extracted'
}

async function capture(url, options, parent) {
  const chunks = []
  let response, bytes = 0, complete = false, error = null
  try {
    await deadline(async (signal) => {
      response = await options.transport(url, signal)
      if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) fail('invalid_status')
      if (!['', 'identity'].includes(response.headers.get('content-encoding') ?? '')) fail('unsupported_encoding')
      const length = response.headers.get('content-length')
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > options.maxBytes)) fail('size_limit')
      for await (const chunk of response.body) {
        signal.throwIfAborted()
        const data = Buffer.from(chunk)
        chunks.push(data.subarray(0, options.maxBytes - bytes))
        const tooLarge = data.length > options.maxBytes - bytes
        bytes += Math.min(data.length, options.maxBytes - bytes)
        if (tooLarge) fail('size_limit')
      }
      if (length !== null && Number(length) !== bytes) fail('length_mismatch')
      complete = true
    }, options.timeoutMs, parent)
  } catch (cause) {
    error = /^[a-zA-Z0-9_]{1,50}$/.test(cause.code ?? '') ? cause.code : 'transport_error'
  } finally { response?.body?.destroy?.() }
  const body = Buffer.concat(chunks)
  const contentType = (response?.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  return { body, headers: response?.headers, httpStatus: response?.status ?? null, contentType: contentType || null,
    responseBytes: body.length, sha256: sha256(body), bodyComplete: complete, error, parseStatus: inspect(body, contentType, complete) }
}

async function safeDirectory(path, existing = false) {
  if (typeof path !== 'string' || !isAbsolute(path) || /[\x00-\x1f]/.test(path) || path.split('/').some((part) => part === '.' || part === '..') || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(basename(path))) fail('unsafe_output')
  const target = resolve(path)
  // No symlink aliases, repository storage, or ambiguous ancestors; parent must exist.
  for (let part = existing ? target : dirname(target); ; part = dirname(part)) {
    const info = await lstat(part)
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(part) !== part) fail('unsafe_output')
    try { await lstat(join(part, '.git')); fail('repository_output') } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (dirname(part) === part) break
  }
  const parent = await lstat(dirname(target))
  // A user-owned parent or sticky temporary directory prevents another user replacing the capture directory.
  if ((parent.uid !== process.getuid() || (parent.mode & 0o022)) && !(parent.uid === 0 && (parent.mode & 0o1000))) fail('unsafe_output')
  if (!existing) await mkdir(target, { mode: 0o700 }) // Exclusive new directory, never recursive or overwriting.
  const info = await lstat(target)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) fail('unsafe_output')
  return target
}

async function privateRead(path, maxBytes) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600 || info.nlink !== 1 || info.size > maxBytes) fail('unsafe_capture')
    const buffer = Buffer.alloc(maxBytes + 1)
    let size = 0
    while (size <= maxBytes) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null)
      if (!bytesRead) break
      size += bytesRead
    }
    if (size > maxBytes) fail('size_limit')
    return buffer.subarray(0, size)
  } finally { await file.close() }
}

export async function retrieve(raw, outputPath, dependencies = {}) {
  manufacturerUrl(raw)
  const originalUrl = raw
  // Tests can shorten bounds but never relax the production ceilings.
  const options = { ...limits, transport: httpsSource, wait: (ms, signal) => delay(ms, undefined, { signal }), now: Date.now, ...dependencies }
  for (const key of Object.keys(limits)) if (!Number.isInteger(options[key]) || options[key] < 1 || options[key] > limits[key]) fail('invalid_limits')
  const output = await safeDirectory(outputPath)
  const save = (name, value) => writeFile(join(output, name), value, { flag: 'wx', mode: 0o600 })
  const receipt = { schemaVersion: 1, retrieverVersion: version, scope: 'public_source_capture_only', originalUrl, inputSha256: sha256(originalUrl), finalUrl: manufacturerUrl(raw).href,
    retrievedAt: new Date(options.now()).toISOString(), reuseStatus: 'unverified', reviewStatus: 'unreviewed_candidates', status: 'interrupted', attempts: [] }
  await save('request.json', `${JSON.stringify({ ...receipt, limits }, null, 2)}\n`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(Object.assign(new Error('timeout'), { code: 'timeout' })), options.totalMs)
  try {
    await (async (signal) => {
      for (let round = 1; round <= options.maxAttempts; round++) {
        let url = manufacturerUrl(originalUrl), redirects = 0
        while (true) {
          signal.throwIfAborted()
          receipt.finalUrl = url.href
          const startedAt = new Date(options.now()).toISOString()
          const result = await capture(url, options, signal)
          const { body, headers, ...fields } = result
          const number = receipt.attempts.length + 1
          const attempt = { number, round, url: url.href, startedAt, completedAt: new Date(options.now()).toISOString(), ...fields,
            bodyFile: `attempt-${number}.bin`, reuseStatus: 'unverified', outcome: result.error ?? 'http_error' }
          let nextUrl = null, retryMs = null
          if (!result.error) {
            if ([301, 302, 303, 307, 308].includes(result.httpStatus)) {
              try {
                const location = headers.get('location')
                if (!location) fail('missing_redirect')
                nextUrl = manufacturerUrl(new URL(location, url).href)
                if (++redirects > options.maxRedirects) fail('redirect_limit')
                attempt.outcome = 'redirect'
              } catch { attempt.outcome = 'redirect_rejected'; nextUrl = null }
            } else if ([401, 403, 407, 451].includes(result.httpStatus) || result.parseStatus === 'access_gate') attempt.outcome = 'access_denied'
            else if (result.httpStatus === 429 || [500, 502, 503, 504].includes(result.httpStatus)) {
              retryMs = retryDelay(headers.get('retry-after'), options.now())
              attempt.outcome = retryMs === null || retryMs > options.maxRetryMs ? 'retry_deferred' : 'retryable_status'
              if (retryMs !== null) attempt.nextRetryAt = new Date(Math.min(options.now() + retryMs, 8640000000000000)).toISOString()
            } else if (result.httpStatus >= 200 && result.httpStatus < 300) attempt.outcome = result.parseStatus === 'not_extracted' ? 'captured_unreviewed' : 'parse_failure'
          }
          await save(attempt.bodyFile, body)
          await save(`attempt-${number}.json`, `${JSON.stringify(attempt, null, 2)}\n`)
          receipt.attempts.push(attempt)
          receipt.status = attempt.outcome
          if (nextUrl) { url = nextUrl; continue }
          if (attempt.outcome === 'retryable_status' && round < options.maxAttempts) {
            await deadline((waitSignal) => options.wait(retryMs, waitSignal), options.maxRetryMs, signal)
            break
          }
          if (attempt.outcome === 'retryable_status') receipt.status = 'attempt_limit'
          return
        }
      }
    })(controller.signal)
  } catch (cause) {
    receipt.status = cause.code === 'timeout' ? 'timeout' : 'capture_error'
  } finally { clearTimeout(timer) }
  receipt.completedAt = new Date(options.now()).toISOString()
  await save('receipt.json', `${JSON.stringify(receipt, null, 2)}\n`)
  return receipt
}

export async function replay(path) {
  const directory = await safeDirectory(path, true)
  const bytes = await privateRead(join(directory, 'receipt.json'), 262144)
  const receipt = JSON.parse(bytes)
  if (receipt.schemaVersion !== 1 || receipt.retrieverVersion !== version || receipt.scope !== 'public_source_capture_only'
    || receipt.reuseStatus !== 'unverified' || receipt.reviewStatus !== 'unreviewed_candidates' || !Array.isArray(receipt.attempts)
    || receipt.attempts.length > limits.maxAttempts * (limits.maxRedirects + 1)) fail('invalid_receipt')
  manufacturerUrl(receipt.originalUrl); manufacturerUrl(receipt.finalUrl)
  if (receipt.inputSha256 !== sha256(receipt.originalUrl)) fail('invalid_receipt')
  const savedRequest = JSON.parse(await privateRead(join(directory, 'request.json'), 16384))
  for (const key of ['schemaVersion', 'retrieverVersion', 'scope', 'originalUrl', 'inputSha256', 'retrievedAt', 'reuseStatus', 'reviewStatus']) {
    if (savedRequest[key] !== receipt[key]) fail('request_mismatch')
  }
  const terminal = receipt.attempts.at(-1)
  if (receipt.finalUrl !== (terminal?.url ?? manufacturerUrl(receipt.originalUrl).href)) fail('invalid_receipt')
  if (receipt.status === 'captured_unreviewed' && (!terminal || terminal.outcome !== 'captured_unreviewed'
    || terminal.bodyComplete !== true || terminal.error !== null || terminal.parseStatus !== 'not_extracted'
    || !Number.isInteger(terminal.httpStatus) || terminal.httpStatus < 200 || terminal.httpStatus >= 300)) fail('invalid_receipt')
  for (const [index, attempt] of receipt.attempts.entries()) {
    manufacturerUrl(attempt.url)
    if (attempt.number !== index + 1 || attempt.bodyFile !== `attempt-${index + 1}.bin` || attempt.reuseStatus !== 'unverified') fail('invalid_receipt')
    const savedAttempt = await privateRead(join(directory, `attempt-${index + 1}.json`), 32768)
    if (savedAttempt.toString() !== `${JSON.stringify(attempt, null, 2)}\n`) fail('attempt_mismatch')
    const body = await privateRead(join(directory, attempt.bodyFile), limits.maxBytes)
    if (body.length !== attempt.responseBytes || sha256(body) !== attempt.sha256) fail('digest_mismatch')
    if (attempt === terminal && receipt.status === 'captured_unreviewed' && inspect(body, attempt.contentType, attempt.bodyComplete) !== 'not_extracted') fail('invalid_receipt')
  }
  return { status: receipt.status, attempts: receipt.attempts.length, originalUrl: receipt.originalUrl, finalUrl: receipt.finalUrl,
    receiptSha256: sha256(bytes), reuseStatus: 'unverified', reviewStatus: 'unreviewed_candidates', networkRequests: 0 }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    let result
    if (args.length === 2 && args[0] === '--replay') result = await replay(args[1])
    else if (args.length === 3 && args[1] === '--output') {
      const receipt = await retrieve(args[0], args[2])
      result = { status: receipt.status, attempts: receipt.attempts.length, reuseStatus: receipt.reuseStatus, reviewStatus: receipt.reviewStatus }
      if (receipt.status !== 'captured_unreviewed') process.exitCode = 2
    } else fail('Usage: catalog-retrieve.mjs <public-manufacturer-https-url> --output <new-absolute-private-directory> | --replay <capture-directory>')
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 }
}
