import { Link, createFileRoute } from '@tanstack/react-router'

import { RequireHousehold } from '@/account/account'
import { AccountSettingsPage } from '@/account/account-settings'
import { authClient } from '../auth-client'
import { Button } from '../components/ui/button'
import { settingsText } from '../copy'
import { RouteError } from '@/kit/route-error'
import { DesignIcon } from '@/kit/design-icons'

export const Route = createFileRoute('/account')({
  errorComponent: RouteError,
  component: Account,
})

function Account() {
  return <RequireHousehold>{() => <AccountRoute />}</RequireHousehold>
}

function AccountRoute() {
  const { data: session } = authClient.useSession()
  return <AccountSettingsPage email={session?.user.email ?? null} back={
    <Button variant="ghost" size="icon" className="-ms-2 justify-self-start text-ink [&_svg]:size-[22px]" render={<Link to="/me" aria-label={settingsText.backToMe} />}><DesignIcon name="arrowLeft" size="1em" aria-hidden="true"  /></Button>
  } />
}
