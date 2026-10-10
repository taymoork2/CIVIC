import { createFileRoute } from '@tanstack/react-router'

import { AccountForm, authSearch } from '@/account/auth-pages'
import { RouteError } from '@/kit/route-error'

export const Route = createFileRoute('/create-account')({
  errorComponent: RouteError,
  validateSearch: authSearch,
  component: CreateAccountRoute,
})

function CreateAccountRoute() {
  const { redirect } = Route.useSearch()
  return <AccountForm mode="create" redirect={redirect} />
}
