import { createFileRoute } from '@tanstack/react-router'
import { lazy } from 'react'
import type { HouseholdSection } from '@/private-state'
import { RouteError } from '@/kit/route-error'

export const Route = createFileRoute('/household')({
  errorComponent: RouteError,
  validateSearch: (search: Record<string, unknown>): { section?: HouseholdSection; machine?: string; product?: string } => ({
    ...(search.section === 'machines' || search.section === 'bottles' || search.section === 'people' ? { section: search.section } : {}),
    ...(typeof search.machine === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(search.machine) ? { machine: search.machine } : {}),
    ...(typeof search.product === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(search.product) ? { product: search.product } : {}),
  }),
  component: lazy(() => import('@/household/household-page').then(module => ({ default: module.Household }))),
})
