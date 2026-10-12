import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'

import { notFoundText, routeErrorText } from '@/copy'
import { NotFound, RouteError } from '@/kit/route-error'

const router = vi.hoisted(() => ({ canGoBack: false }))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useRouter: () => ({ history: { back: vi.fn() }, invalidate: vi.fn() }),
  useCanGoBack: () => router.canGoBack,
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => createElement('a', { ...props, href: to }, children),
}))

// The household gate is covered elsewhere; here it simply lets the page through.
vi.mock('@/account/account', () => ({
  RequireHousehold: ({ children }: { children: (household: unknown) => React.ReactNode }) => children({}),
}))

test('the not-found page names the problem and offers a way home', () => {
  router.canGoBack = false
  const markup = renderToStaticMarkup(<NotFound />)
  expect(markup).toMatch(new RegExp(`<h1[^>]*>${notFoundText.title}</h1>`))
  expect(markup).toMatch(new RegExp(`<a[^>]*href="/"[^>]*>${notFoundText.home}</a>`))
  expect(markup).not.toContain(`>${notFoundText.back}</button>`)
})

test('the not-found page offers Back only when there is somewhere to go back to', () => {
  router.canGoBack = true
  const markup = renderToStaticMarkup(<NotFound />)
  expect(markup).toContain(`>${notFoundText.back}</button>`)
})

test('the route error keeps its heading and home action on the shared message page', () => {
  const denied = renderToStaticMarkup(<RouteError error={new Error('ArgumentValidationError: bad id')} />)
  expect(denied).toMatch(new RegExp(`<h1[^>]*>${routeErrorText.denied}</h1>`))
  expect(denied).toContain(routeErrorText.deniedDetail)
  expect(denied).toMatch(new RegExp(`<a[^>]*href="/"[^>]*>${routeErrorText.home}</a>`))
  expect(denied).not.toContain('>Try again</button>')

  const failed = renderToStaticMarkup(<RouteError error={new Error('Server unavailable')} />)
  expect(failed).toMatch(new RegExp(`<h1[^>]*>${routeErrorText.failed}</h1>`))
  expect(failed).toContain('>Try again</button>')
})
