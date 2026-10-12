import { useState } from 'react'
import { defaultAppearance, type Appearance } from '@/kit/appearance'
import { Button } from '@/components/ui/button'
import { AppearanceSettingsView, SettingsView, UnitsView } from '@/routes/settings'
import { AccountSettingsView, ChangePasswordSheet, type PasswordVisualState } from '@/account/account-settings'
import { settingsText } from '@/copy'
import type { UnitChoice } from '@/kit/units'
import { DesignIcon } from '@/kit/design-icons'

/** Visual choices are local state only; no preference, account or backend write is reachable. */
export function SettingsPreview({ password = false, account = false, passwordState }: { password?: boolean; account?: boolean; passwordState?: PasswordVisualState }) {
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance)
  const [units, setUnits] = useState<UnitChoice>('auto')
  const [open, setOpen] = useState(password)
  const back = <Button variant="ghost" size="icon" className="-ms-2 justify-self-start text-ink [&_svg]:size-[22px]" aria-label={settingsText.backToMe} onClick={() => {}}><DesignIcon name="arrowLeft" size="1em" aria-hidden="true"  /></Button>
  if (account || password) return <AccountSettingsView email="alex@example.com" back={back} onOpen={(sheet) => { if (sheet === 'password') setOpen(true) }}>
    {open ? <ChangePasswordSheet visualState={passwordState} changePassword={async () => { throw new Error('This visual preview does not change account credentials.') }} onClose={() => setOpen(false)} /> : null}
  </AccountSettingsView>
  return <SettingsView back={back}
    appearance={<AppearanceSettingsView appearance={appearance} onChange={(patch) => setAppearance((current) => ({ ...current, ...patch }))} />}
    units={<UnitsView system={units === 'metric' ? 'metric' : 'imperial'} choice={units} onChange={setUnits} />} />
}
