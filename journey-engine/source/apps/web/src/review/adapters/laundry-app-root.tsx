import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { AppShell, navigationItems } from '@/kit/app-shell'
import { HouseholdDataProvider } from '@/household/household-data'
import { StartupProvider } from '@/startup-context'
import { UnitsProvider } from '@/kit/units'

/** Replace document boot only; actual file routes, components, actions and search validators remain. */
export const Route = createRootRoute({ component: () => <StartupProvider><HouseholdDataProvider><UnitsProvider><AppShell navigation={<ul>{navigationItems.map((item) => <li key={item.to}><Link to={item.to}>{item.label}</Link></li>)}</ul>}><Outlet /></AppShell></UnitsProvider></HouseholdDataProvider></StartupProvider> })
