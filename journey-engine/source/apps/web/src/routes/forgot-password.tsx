import { createFileRoute } from '@tanstack/react-router'

import { ForgotPassword, resetSearch } from '@/account/auth-pages'
import { RouteError } from '@/kit/route-error'

export const Route = createFileRoute('/forgot-password')({
  errorComponent: RouteError,
  validateSearch: resetSearch,
  component: ForgotPasswordRoute,
})

function ForgotPasswordRoute() {
  const { step } = Route.useSearch()
  return <ForgotPassword step={step} />
}
