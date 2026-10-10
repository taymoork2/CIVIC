import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'

import { ForgotPassword, resetApi, type ResetApi, type ResetStep } from '@/account/auth-pages'
import { authText, joinText, resetText } from '@/copy-account'
import { InviteLinkNotice, SignedOutInvite, inviteProblemMessage } from '@/account/join-flow'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useRouter: () => ({ navigate: vi.fn(), history: { replace: vi.fn() } }),
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => createElement('a', { ...props, href: to }, children),
}))

afterEach(() => vi.unstubAllEnvs())

/** A deployment with an email sender, so the reset steps render their fields. */
const sendingApi: ResetApi = { ...resetApi, available: true }

test.each(['email', 'code', 'password'] as const)('pending reset %s disables every field and the primary action', (step: ResetStep) => {
  vi.stubEnv('DEV', true)
  const html = renderToStaticMarkup(<ForgotPassword step={step} api={sendingApi} visualPreview previewState="busy" />)
  const fields = html.match(/<input\b[^>]*>/g) ?? []
  expect(fields).toHaveLength(step === 'password' ? 2 : 1)
  for (const field of fields) expect(field).toContain(' disabled=""')
  expect(html.match(/<button\b(?=[^>]*type="submit")[^>]*>/)?.[0]).toContain(' disabled=""')
  expect(html).toContain(step === 'email' ? resetText.sending : step === 'code' ? resetText.checking : resetText.saving)
})

test.each([
  ['email', authText.errors.email],
  ['code', resetText.codeShort],
  ['password', authText.errors.passwordShort],
] as const)('reset %s invalid fixture describes its actual field', (step, message) => {
  vi.stubEnv('DEV', true)
  const html = renderToStaticMarkup(<ForgotPassword step={step} api={sendingApi} visualPreview previewState="invalid" />)
  expect(html).toContain(message)
  expect(html).toMatch(/<input[^>]*aria-invalid="true"[^>]*aria-describedby="[^"]+-error"/)
})

test('production ignores reset preview state and reloads later steps to honest unavailable email', () => {
  vi.stubEnv('DEV', false)
  const html = renderToStaticMarkup(<ForgotPassword step="password" visualPreview previewState="busy" />)
  expect(html).toContain(resetText.emailUnavailableTitle)
  expect(html).not.toContain(resetText.saving)
  expect(resetApi.available).toBe(false)
})

test('unavailable reset gives directions only: no code promise, no email field, the real path named', () => {
  const html = renderToStaticMarkup(<ForgotPassword />)
  expect(html).not.toContain(resetText.emailDetail)
  expect(html).not.toMatch(/We(’|')ll send/)
  expect(html).toContain('Me → Account → Change password')
  expect(html).toContain(resetText.newAccountEmpty)
  expect(html).not.toMatch(/<input\b/)
  expect(html).not.toMatch(/type="submit"/)
  expect(html).not.toContain(resetText.sendCode)
  expect(html).toContain(resetText.backToSignIn)
})

test('unconfigured reset API rejects every operation without a successful reset', async () => {
  await expect(resetApi.sendCode('alex@example.com')).rejects.toThrow(resetText.notSetUp)
  await expect(resetApi.verifyCode('alex@example.com', '123456')).rejects.toThrow(resetText.notSetUp)
  await expect(resetApi.setPassword('alex@example.com', '123456', 'password')).rejects.toThrow(resetText.notSetUp)
})

test('existing invite outcomes retain sanitized copy, focus target and home action', () => {
  const problems = [{ status: 'unknown' }, { status: 'expired', expiresAt: Date.UTC(2026, 9, 1, 12) }, { status: 'used' }] as const
  for (const problem of problems) {
    const html = renderToStaticMarkup(<InviteLinkNotice problem={problem} onHome={() => {}} />)
    expect(html).toContain(inviteProblemMessage(problem))
    expect(html).toContain('role="alert"')
    expect(html).toMatch(/<h1[^>]*tabindex="-1"/)
    expect(html).toContain(joinText.goHome)
    expect(html).not.toContain(joinText.joinAction)
  }
  const member = renderToStaticMarkup(<InviteLinkNotice problem={null} onHome={() => {}} />)
  expect(member).toContain(joinText.alreadyInDetail)
  expect(member).not.toContain('role="alert"')
  expect(member).toContain(joinText.goHome)
})

test('signed-out invite keeps the exact encoded same-site return path on both account links', () => {
  const code = 'LC/7Q2M?name=Alex & family#invite'
  const screen = SignedOutInvite({ code })
  for (const action of [screen.props.primary, screen.props.secondary]) {
    expect(action.props.render.props.search).toEqual({ redirect: `/join/${encodeURIComponent(code)}` })
  }
  expect(screen.props.primary.props.render.props.to).toBe('/create-account')
  expect(screen.props.secondary.props.render.props.to).toBe('/sign-in')
})
