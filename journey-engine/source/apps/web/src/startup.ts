import { createServerFn } from '@tanstack/react-start'

export const getStartup = createServerFn({ method: 'GET' })
  .validator((input: { pathname: string }) => {
    if (typeof input?.pathname !== 'string' || !input.pathname.startsWith('/') || input.pathname.length > 2048) throw new Error('Invalid app path')
    return input
  })
  .handler(async ({ data }) => {
    const { buildStartup } = await import('./startup.server')
    return buildStartup(data.pathname)
  })
