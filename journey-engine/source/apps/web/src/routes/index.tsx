import { createFileRoute, redirect } from '@tanstack/react-router'
import { lazy } from 'react'
import { laundrySearch } from '@/laundry/laundry-search'
import { RouteError } from '@/kit/route-error'

export const Route = createFileRoute('/')({
  errorComponent: RouteError,
  validateSearch: laundrySearch,
  beforeLoad: ({ search }) => {
    if (search.plan !== undefined || search.add !== undefined || search.make !== undefined) throw redirect({ to: '/laundry', search, replace: true })
  },
  component: lazy(() => import('@/home/home-page').then(module => ({ default: module.Home }))),
})

export { HomeOverview } from '@/home/home-page'
