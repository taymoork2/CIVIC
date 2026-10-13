import { createRootRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { AppShell, currentTab, navigationItems } from '@/kit/app-shell'
import { DesignIcon, type DesignIconName } from '@/kit/design-icons'
import { HouseholdDataProvider } from '@/household/household-data'
import { StartupProvider } from '@/startup-context'
import { UnitsProvider } from '@/kit/units'

const navigationIcons = { '/': 'home', '/laundry': 'laundry', '/closet': 'closet', '/household': 'people', '/me': 'me' } as const satisfies Record<string, DesignIconName>

function Navigation() {
  const path = useRouterState({ select: state => state.location.pathname })
  return <ul>{navigationItems.map(item => <li key={item.to}>
    <Link to={item.to} activeOptions={{ exact: item.to === '/' }} aria-current={item.to === currentTab(path) ? 'page' : undefined}>
      <span className="tab-icon-wrap relative place-items-center [display:inline-grid]"><DesignIcon name={navigationIcons[item.to]} /></span>
      <span>{item.label}</span>
    </Link>
  </li>)}</ul>
}

/** Replace document boot only; actual file routes, components, actions and search validators remain. */
export const Route = createRootRoute({ component: () => <StartupProvider><HouseholdDataProvider><UnitsProvider><AppShell navigation={<Navigation />}><Outlet /></AppShell></UnitsProvider></HouseholdDataProvider></StartupProvider> })
