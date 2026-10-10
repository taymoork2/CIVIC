import { createFileRoute } from '@tanstack/react-router'

import { AccountForm, authSearch } from '@/account/auth-pages'
import { RouteError } from '@/kit/route-error'

export const Route = createFileRoute('/sign-in')({
  errorComponent: RouteError,
  validateSearch: authSearch,
  component: SignInRoute,
})

function SignInRoute() {
  const { redirect } = Route.useSearch()
  return <AccountForm mode="sign-in" redirect={redirect} />
}
