import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { dockLink } from '@/routes/__root'

/** The dock link renders inside a minimal router so the href is the real one a tab would get. */
async function hrefOf(target: Parameters<typeof dockLink>[0]): Promise<string> {
  const root = createRootRoute({ component: () => dockLink(target, { className: 'dock', children: 'Go' }) })
  const drying = createRoute({ getParentRoute: () => root, path: '/drying' })
  const router = createRouter({ routeTree: root.addChildren([drying]), history: createMemoryHistory({ initialEntries: ['/closet'] }) })
  await router.load()
  return renderToString(<RouterProvider router={router} />).match(/href="([^"]*)"/)?.[1] ?? ''
}

test('the dock link on other tabs keeps the dryer run, so "take out now" opens that run\'s check', async () => {
  expect(await hrefOf({ to: 'drying', run: 'run123' } as never)).toBe('/drying?run=run123')
  expect(await hrefOf({ to: 'drying' } as never)).toBe('/drying')
})
