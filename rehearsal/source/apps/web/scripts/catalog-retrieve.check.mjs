import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { httpsSource, limits, manufacturerUrl, publicIpv4, replay, retrieve, retryDelay } from './catalog-retrieve.mjs'

const URL = 'https://smartlabel.pg.com/en-us/00030772121108.html'
const NOW = Date.parse('2026-10-05T12:00:00Z')
const error = (code) => ({ code })
function response(status = 200, text = '<html><body>Public product document</body></html>', headers = {}) {
  return { status, headers: new Headers({ 'content-type': 'text/html; charset=utf-8', ...headers }), body: (async function* () { yield Buffer.from(text) })() }
}
async function workspace(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'catalog-retrieval-test-')))
  t.after(() => rm(root, { recursive: true, force: true })) // Only this test-created private root.
  return root
}
const mocked = (transport, extra = {}) => ({ transport, now: () => NOW, wait: async () => {}, ...extra })

test('only explicit known public HTTPS manufacturer URLs and public IPv4 addresses pass', () => {
  assert.equal(manufacturerUrl(URL).href, URL)
  assert.equal(manufacturerUrl('https://rbnainfo.com/smart-label.php?productLineId=1833').hostname, 'rbnainfo.com')
  for (const raw of ['http://tide.com/a', 'https://tide.com:8443/a', 'https://tide.com.evil.test/a', 'https://evil.tide.com/a',
    'https://tide.com@127.0.0.1/a', 'https://me:secret@tide.com/a', 'https://tide.com/a#secret', 'https://tide.com/a?token=secret',
    'https://tide.com/login', 'https://tide.com/%73ignin', 'https://tide.com/%ff', 'https://tide.com/a?to=https://127.0.0.1',
    'https://tide.com/a?__proto__=secret', 'https://rbnainfo.com/a?productLineId=1&productLineId=2', ' https://tide.com/a', 'https://tide.com\\@evil.test/a']) {
    assert.throws(() => manufacturerUrl(raw), undefined, raw)
  }
  for (const address of ['0.1.2.3', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1',
    '192.168.1.1', '192.0.0.1', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::1', '::ffff:127.0.0.1', 'bad']) {
    assert.equal(publicIpv4(address), false, address)
  }
  assert.equal(publicIpv4('93.184.216.34'), true)
})

test('DNS rejects a mixed public/private answer and pins the validated socket lookup', async () => {
  let connected = false
  await assert.rejects(httpsSource(manufacturerUrl(URL), new AbortController().signal, async () => [
    { address: '93.184.216.34' }, { address: '127.0.0.1' },
  ], () => { connected = true }), error('nonpublic_dns'))
  assert.equal(connected, false)
  await httpsSource(manufacturerUrl(URL), new AbortController().signal, async (_host, options) => {
    assert.deepEqual(options, { family: 4, all: true })
    return [{ address: '93.184.216.34', family: 4 }]
  }, (url, options, callback) => {
    assert.equal(url.hostname, 'smartlabel.pg.com')
    assert.equal(options.agent, false)
    assert.equal(options.headers['Accept-Encoding'], 'identity')
    assert.equal(options.headers.Cookie, undefined)
    options.lookup(url.hostname, {}, (err, address, family) => { assert.equal(err, null); assert.equal(address, '93.184.216.34'); assert.equal(family, 4) })
    options.lookup(url.hostname, { all: true }, (err, entries) => { assert.equal(err, null); assert.deepEqual(entries, [{ address: '93.184.216.34', family: 4 }]) })
    const req = new EventEmitter()
    req.end = () => callback({ statusCode: 200, headers: {}, destroy() {} })
    return req
  })
})

test('capture and replay bind private body and attempt digests, with zero replay fetches', async (t) => {
  const root = await workspace(t), directory = join(root, 'capture')
  let calls = 0
  const receipt = await retrieve(URL, directory, mocked(async () => { calls++; return response() }))
  assert.equal(receipt.status, 'captured_unreviewed')
  assert.equal(receipt.attempts[0].parseStatus, 'not_extracted')
  assert.equal(receipt.attempts[0].httpStatus, 200)
  assert.equal(receipt.originalUrl, URL)
  assert.equal(receipt.retrievedAt, '2026-10-05T12:00:00.000Z')
  assert.equal((await lstat(directory)).mode & 0o777, 0o700)
  assert.equal((await lstat(join(directory, 'attempt-1.bin'))).mode & 0o777, 0o600)
  const replayed = await replay(directory)
  assert.equal(replayed.networkRequests, 0)
  assert.equal(replayed.reuseStatus, 'unverified')
  assert.equal(replayed.reviewStatus, 'unreviewed_candidates')
  assert.equal(calls, 1)
  await assert.rejects(retrieve(URL, directory, mocked(async () => { calls++; return response() })), error('EEXIST'))
  assert.equal(calls, 1)
  await writeFile(join(directory, 'attempt-1.bin'), 'altered', { mode: 0o600 })
  await assert.rejects(replay(directory), error('digest_mismatch'))
})

test('paths reject relative/traversal/repository/symlink/world-writable storage before fetch', async (t) => {
  const root = await workspace(t)
  let calls = 0
  const transport = mocked(async () => { calls++; return response() })
  for (const path of ['relative', `${root}/../escape`, `${root}/./capture`, `${root}/bad\nname`, `${root}/.hidden`]) await assert.rejects(retrieve(URL, path, transport))
  await mkdir(join(root, 'repo')); await writeFile(join(root, 'repo', '.git'), 'marker')
  await assert.rejects(retrieve(URL, join(root, 'repo', 'capture'), transport), error('repository_output'))
  await symlink(root, join(root, 'link'))
  await assert.rejects(retrieve(URL, join(root, 'link', 'capture'), transport), error('unsafe_output'))
  await mkdir(join(root, 'shared')); await chmod(join(root, 'shared'), 0o777)
  await assert.rejects(retrieve(URL, join(root, 'shared', 'capture'), transport), error('unsafe_output'))
  assert.equal(calls, 0)
})

test('replay refuses symlink payloads, modified attempt receipts and nonprivate files', async (t) => {
  const root = await workspace(t)
  for (const kind of ['symlink', 'attempt', 'request', 'permissions']) {
    const directory = join(root, kind)
    await retrieve(URL, directory, mocked(async () => response()))
    if (kind === 'symlink') {
      await writeFile(join(root, 'outside'), 'untrusted', { mode: 0o600 })
      await rm(join(directory, 'attempt-1.bin'))
      await symlink(join(root, 'outside'), join(directory, 'attempt-1.bin'))
    } else if (kind === 'attempt') await writeFile(join(directory, 'attempt-1.json'), '{}', { mode: 0o600 })
    else if (kind === 'request') await writeFile(join(directory, 'request.json'), '{}', { mode: 0o600 })
    else await chmod(join(directory, 'receipt.json'), 0o644)
    await assert.rejects(replay(directory))
  }
})

test('replay rejects successful-status spoofing and original/final URL or request drift', async (t) => {
  const root = await workspace(t)
  for (const [index, mutate] of [
    (receipt) => { receipt.status = 'captured_unreviewed' },
    (receipt) => { receipt.originalUrl = 'https://tide.com/different' },
    (receipt) => { receipt.finalUrl = 'https://tide.com/different' },
    (receipt) => { receipt.inputSha256 = '0'.repeat(64) },
    (receipt) => { receipt.retrievedAt = '2026-10-04T12:00:00.000Z' },
  ].entries()) {
    const directory = join(root, `drift-${index}`)
    const receipt = await retrieve(URL, directory, mocked(async () => { throw Object.assign(new Error(), { code: 'ENOTFOUND' }) }))
    mutate(receipt)
    await writeFile(join(directory, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
    await assert.rejects(replay(directory))
  }
})

test('redirects retain original/final URLs and stop at rejected hosts, gates or depth', async (t) => {
  const root = await workspace(t)
  let urls = []
  const receipt = await retrieve(URL, join(root, 'redirect'), mocked(async (url) => {
    urls.push(url.href)
    return urls.length === 1 ? response(302, '', { location: 'https://tide.com/public-product' }) : response()
  }))
  assert.deepEqual(urls, [URL, 'https://tide.com/public-product'])
  assert.equal(receipt.finalUrl, urls[1])
  assert.equal(receipt.attempts[0].outcome, 'redirect')
  await replay(join(root, 'redirect'))
  for (const [index, location] of ['https://127.0.0.1/private', 'http://tide.com/a', 'https://evil.test/a', '/login', 'https://tide.com/a?token=secret', null].entries()) {
    let count = 0
    const failed = await retrieve(URL, join(root, `reject-${index}`), mocked(async () => { count++; return response(302, '', location ? { location } : {}) }))
    assert.equal(failed.status, 'redirect_rejected'); assert.equal(count, 1)
    assert.equal(JSON.stringify(failed).includes('secret'), false)
  }
  let count = 0
  const failed = await retrieve(URL, join(root, 'loop'), mocked(async () => { count++; return response(302, '', { location: '/loop' }) }))
  assert.equal(failed.status, 'redirect_rejected'); assert.equal(count, limits.maxRedirects + 1)
})

test('denial/login/404/parse failures never retry and never become missing chemistry', async (t) => {
  const root = await workspace(t)
  const cases = [
    [401, 'no', {}, 'access_denied'], [403, 'no', {}, 'access_denied'], [407, 'no', {}, 'access_denied'], [451, 'no', {}, 'access_denied'],
    [200, '<html><input type="password"></html>', {}, 'access_denied'], [200, '<title>Just a moment</title>', {}, 'access_denied'],
    [404, '', {}, 'http_error'], [200, '', {}, 'parse_failure'], [200, '{bad', { 'content-type': 'application/json' }, 'parse_failure'],
    [200, 'not pdf', { 'content-type': 'application/pdf' }, 'parse_failure'], [200, 'zip', { 'content-type': 'application/zip' }, 'parse_failure'],
    [200, '\xff', {}, 'captured_unreviewed'], [200, '%PDF-1.7', { 'content-type': 'application/pdf' }, 'captured_unreviewed'],
  ]
  for (const [index, [status, text, headers, outcome]] of cases.entries()) {
    let calls = 0
    const receipt = await retrieve(URL, join(root, `status-${index}`), mocked(async () => { calls++; return response(status, text, headers) }))
    assert.equal(receipt.status, outcome); assert.equal(calls, 1)
    assert.equal(receipt.reuseStatus, 'unverified')
    await replay(join(root, `status-${index}`))
  }
})

test('429/selected 5xx retry budgets and Retry-After seconds/dates/deferred values are bounded', async (t) => {
  const root = await workspace(t)
  assert.equal(retryDelay('2', NOW), 2000)
  assert.equal(retryDelay(new Date(NOW + 2000).toUTCString(), NOW), 2000)
  assert.equal(retryDelay('not-a-date', NOW), null)
  for (const status of [429, 500, 502, 503, 504]) {
    let count = 0, waited = []
    const receipt = await retrieve(URL, join(root, `retry-${status}`), mocked(async () => ++count === 1 ? response(status, '', { 'retry-after': '0' }) : response(), { wait: async (ms) => { waited.push(ms) } }))
    assert.equal(receipt.status, 'captured_unreviewed'); assert.equal(count, 2); assert.deepEqual(waited, [0])
  }
  for (const [index, header] of ['120', new Date(NOW + 60000).toUTCString(), 'bad'].entries()) {
    let count = 0
    const receipt = await retrieve(URL, join(root, `deferred-${index}`), mocked(async () => { count++; return response(429, '', { 'retry-after': header }) }))
    assert.equal(receipt.status, 'retry_deferred'); assert.equal(count, 1)
  }
  let count = 0
  const receipt = await retrieve(URL, join(root, 'exhausted'), mocked(async () => { count++; return response(503) }))
  assert.equal(receipt.status, 'attempt_limit'); assert.equal(count, limits.maxAttempts)
  count = 0
  const maximum = await retrieve(URL, join(root, 'maximum-hops'), mocked(async () => ++count % 4 ? response(302, '', { location: '/next' }) : response(503)))
  assert.equal(maximum.status, 'attempt_limit'); assert.equal(count, limits.maxAttempts * (limits.maxRedirects + 1))
  await replay(join(root, 'maximum-hops'))
})

test('size, compression, length and invalid UTF-8 failures retain bounded partial receipts', async (t) => {
  const root = await workspace(t)
  const cases = [
    [response(200, '0123456789'), 'size_limit'], [response(200, '', { 'content-length': '100' }), 'size_limit'],
    [response(200, '', { 'content-encoding': 'gzip' }), 'unsupported_encoding'], [response(200, 'a', { 'content-length': '2' }), 'length_mismatch'],
  ]
  for (const [index, [result, outcome]] of cases.entries()) {
    const receipt = await retrieve(URL, join(root, `bounded-${index}`), mocked(async () => result, { maxBytes: 5 }))
    assert.equal(receipt.status, outcome)
    assert.equal(receipt.attempts[0].bodyComplete, false)
    assert.ok(receipt.attempts[0].responseBytes <= 5)
    await replay(join(root, `bounded-${index}`))
  }
  const receipt = await retrieve(URL, join(root, 'utf8'), mocked(async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/html' }), body: (async function* () { yield Buffer.from([0xff]) })() })))
  assert.equal(receipt.status, 'parse_failure'); assert.equal(receipt.attempts[0].parseStatus, 'invalid_utf8')
})

test('DNS/connection/body timeout and network refusal persist one failure receipt', async (t) => {
  const root = await workspace(t)
  const transports = [
    () => new Promise(() => {}),
    (url, signal) => httpsSource(url, signal, () => new Promise(() => {})),
    async () => ({ status: 200, headers: new Headers(), body: (async function* () { yield Buffer.from('partial'); await new Promise(() => {}) })() }),
    async () => { throw Object.assign(new Error('hostname details'), { code: 'ENOTFOUND' }) },
  ]
  for (const [index, transport] of transports.entries()) {
    const receipt = await retrieve(URL, join(root, `timeout-${index}`), mocked(transport, { timeoutMs: 15 }))
    assert.equal(receipt.status, index === 3 ? 'ENOTFOUND' : 'timeout')
    assert.equal(receipt.attempts.length, 1)
    assert.equal(JSON.stringify(receipt).includes('hostname details'), false)
    await replay(join(root, `timeout-${index}`))
  }
  const receipt = await retrieve(URL, join(root, 'total-timeout'), mocked(async () => response(429, '', { 'retry-after': '1' }), { totalMs: 15, wait: () => new Promise(() => {}) }))
  assert.equal(receipt.status, 'timeout'); assert.equal(receipt.attempts.length, 1)
  await replay(join(root, 'total-timeout'))
})

test('CLI validates arguments and replays without network or raw contents on stdout', async (t) => {
  const root = await workspace(t), directory = join(root, 'cli')
  await retrieve(URL, directory, mocked(async () => response()))
  const script = new globalThis.URL('./catalog-retrieve.mjs', import.meta.url).pathname
  const result = spawnSync(process.execPath, [script, '--replay', directory], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(JSON.parse(result.stdout).networkRequests, 0)
  assert.equal(result.stdout.includes('Public product document'), false)
  const invalid = spawnSync(process.execPath, [script, 'https://evil.test/a', '--output', join(root, 'invalid')], { encoding: 'utf8' })
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /invalid_url/)
  assert.ok((await readFile(join(directory, 'request.json'), 'utf8')).includes('unverified'))
})
