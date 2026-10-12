import { beforeEach, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from './test/markup'

const mocked = vi.hoisted(() => ({ headers: new Map<string, string>(), header: vi.fn(), token: vi.fn(), query: vi.fn() }))
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeader: (name: string) => mocked.headers.get(name),
  setResponseHeader: mocked.header,
}))
vi.mock('@tanstack/react-start/rsc', () => ({ renderServerComponent: async (node: unknown) => node }))
vi.mock('./convex-site.server', () => ({ getToken: mocked.token, fetchAuthQuery: mocked.query }))

import { buildStartup } from './startup.server'

const household = { householdId: 'household-a', name: 'Home', role: 'owner', washPlace: 'home', firstHamperNotePending: false }
const onboarding = { principalKey: 'person-a', displayName: 'Pat', households: [household] }
const token = `header.${Buffer.from(JSON.stringify({ sessionId: 'session-a' })).toString('base64url')}.signature`

beforeEach(() => {
  vi.clearAllMocks()
  mocked.headers.clear()
  mocked.token.mockReset()
  mocked.query.mockReset()
})

test('a credential-free request renders the public entry without contacting auth or private queries', async () => {
  const result = await buildStartup('/')
  expect(result.account).toBe('signed-out')
  expect(result.onboarding).toBeNull()
  expect(result.homeSummary).toBeNull()
  expect(mocked.token).not.toHaveBeenCalled()
  expect(mocked.query).not.toHaveBeenCalled()
  expect(mocked.header).toHaveBeenLastCalledWith('Cache-Control', 'no-cache')
  expect(mocked.header).toHaveBeenCalledWith('Vary', 'Cookie, Authorization')
})

test('a cookie without a verified token never loads private data', async () => {
  mocked.headers.set('cookie', 'invalid-session')
  mocked.token.mockResolvedValue(undefined)
  const result = await buildStartup('/')
  expect(result.account).toBe('signed-out')
  expect(mocked.query).not.toHaveBeenCalled()
})

test('every authenticated route receives the same authorized household snapshot', async () => {
  mocked.headers.set('cookie', 'session-a')
  mocked.token.mockResolvedValue(token)
  const seed = () => mocked.query.mockResolvedValueOnce(onboarding)
    .mockResolvedValueOnce({ textiles: [] }).mockResolvedValueOnce([])
    .mockResolvedValueOnce({ hamper: { count: 4 } }).mockResolvedValueOnce({ ready: [] }).mockResolvedValueOnce(null)
  seed()
  const result = await buildStartup('/')
  expect(result.account).toBe('signed-in')
  expect(result.sessionId).toBe('session-a')
  expect(result.snapshot).toMatchObject({ householdId: 'household-a', inventory: { textiles: [] }, sessions: [], attention: { hamper: { count: 4 } }, today: { ready: [] }, plan: null })
  expect(mocked.query.mock.calls.slice(1).every((call) => call[1].householdId === 'household-a')).toBe(true)
  const markup = renderToStaticMarkup(<>{result.homeSummary}</>)
  expect(markup).toContain('4 pieces waiting for care')
  expect(markup).not.toMatch(/<(input|button)\b/)
  mocked.query.mockReset()
  seed()
  const other = await buildStartup('/me')
  expect(other.homeSummary).toBeNull()
  expect(other.snapshot).toEqual(result.snapshot)
  expect(mocked.query).toHaveBeenCalledTimes(6)
})

test('first run has no household summary or invented counts', async () => {
  mocked.headers.set('cookie', 'session-a')
  mocked.token.mockResolvedValue(token)
  mocked.query.mockResolvedValue({ ...onboarding, households: [] })
  const result = await buildStartup('/')
  expect(result.account).toBe('signed-in')
  expect(result.homeSummary).toBeNull()
  expect(result.snapshot).toBeNull()
  expect(mocked.query).toHaveBeenCalledTimes(1)
})

test.each(['auth-unreachable', 'membership-rejected'])('%s discards tokens and all private snapshot data', async (failure) => {
  mocked.headers.set('cookie', 'session-a')
  if (failure === 'auth-unreachable') mocked.token.mockRejectedValue(new Error('Unavailable'))
  else {
    mocked.token.mockResolvedValue(token)
    mocked.query.mockResolvedValueOnce(onboarding).mockRejectedValueOnce(new Error('Forbidden'))
  }
  const result = await buildStartup('/')
  expect(result).toMatchObject({ account: 'unknown', token: undefined, onboarding: null, homeSummary: null })
})
