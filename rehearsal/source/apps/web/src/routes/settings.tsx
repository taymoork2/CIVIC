import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useId, useState, type ReactNode } from 'react'

import { RequireHousehold, type CurrentHousehold } from '@/account/account'
import { pageDetailClassName } from '@/account/account-page'
import { applyAppearance, defaultAppearance, loadAppearance, saveAppearance, themeChoices, type Appearance, type ThemeChoice } from '@/kit/appearance'
import { settingsText } from '../copy'
import { FeedbackSettings } from '@/dev/feedback-sheet'
import { RecordList } from '@/kit/record-row'
import { RouteError } from '@/kit/route-error'
import { useUnits, type UnitChoice, type UnitSystem } from '@/kit/units'
import { Button } from '../components/ui/button'
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group'
import { DesignIcon } from '@/kit/design-icons'
import { SwitchRow, TaskHeading } from '@/laundry/laundry-ui'
import { PushSettings } from '@/account/push-settings'

export const Route = createFileRoute('/settings')({
  errorComponent: RouteError,
  component: Settings,
})

/** Opened from Me; Me stays lit in the tab bar. */
function Settings() {
  return <RequireHousehold>{(household) => <SettingsRoute household={household} />}</RequireHousehold>
}

function SettingsRoute({ household }: { household: CurrentHousehold }) {
  return <SettingsPage household={household} back={
    <Button variant="ghost" size="icon" className="-ms-2 justify-self-start text-ink [&_svg]:size-[22px]" render={<Link to="/me" aria-label={settingsText.backToMe} />}><DesignIcon name="arrowLeft" size="1em" aria-hidden="true"  /></Button>
  } />
}

/** Device preferences and feedback; account management lives on its own screen. */
export function SettingsPage({ back, household }: { back: ReactNode; household?: CurrentHousehold }) {
  return <SettingsView back={back} appearance={<><AppearanceSettings />{household === undefined ? null : <PushSettings />}</>} units={<Units />} feedback={household === undefined ? null : <FeedbackSettings household={household} />} />
}

/** Same Settings layout with dependencies supplied by the connected page or inert fixtures. */
export function SettingsView({ back, appearance, units, feedback }: {
  back: ReactNode
  appearance: ReactNode
  units: ReactNode
  feedback?: ReactNode
}) {
  return <div className="settings-page grid gap-5 w-full pb-8">
    <TaskHeading title={settingsText.title} back={back} />
    {appearance}
    {units}
    {feedback}
  </div>
}

const themeWords: Readonly<Record<ThemeChoice, string>> = settingsText.themes

/** A labelled segmented control: 16/650 label, then one radio group. */
function Segmented({ label, caption, children }: { label: string; caption?: string; children: (labelId: string) => ReactNode }) {
  const labelId = useId()
  return <div className="grid min-w-0 gap-2 [container-type:inline-size] [@container_(width_<_16rem)]:[&_[data-slot=radio-group]]:flex-col [@container_(width_<_16rem)]:[&_[data-slot=radio-group]]:gap-1">
    <h2 id={labelId} className="m-0 text-[length:var(--step-1)] font-semibold">{label}</h2>
    {children(labelId)}
    {caption === undefined ? null : <p className={pageDetailClassName}>{caption}</p>}
  </div>
}

function AppearanceSettings() {
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance)
  useEffect(() => setAppearance(loadAppearance()), [])
  const pick = (patch: Partial<Appearance>) => {
    const next = { ...loadAppearance(), ...patch }
    setAppearance(next)
    saveAppearance(next)
    applyAppearance(next)
  }
  return <AppearanceSettingsView appearance={appearance} onChange={pick} />
}

export function AppearanceSettingsView({ appearance, onChange }: { appearance: Appearance; onChange: (patch: Partial<Appearance>) => void }) {
  return <><Segmented label={settingsText.appearance}>
    {(labelId) => <RadioGroup variant="segment" value={appearance.theme} onValueChange={(theme) => onChange({ theme: theme as ThemeChoice })} aria-labelledby={labelId} className="w-full">
      {themeChoices.map((theme) => <RadioGroupItem variant="segment" key={theme} value={theme} className="flex-1">{themeWords[theme]}</RadioGroupItem>)}
    </RadioGroup>}
  </Segmented>
    <Segmented label="Motion">
      {(labelId) => <RadioGroup variant="segment" value={appearance.motion ?? 'system'} onValueChange={(motion) => onChange({ motion: motion as NonNullable<Appearance['motion']> })} aria-labelledby={labelId} className="w-full">
        {(['system', 'reduce', 'full'] as const).map((value) => <RadioGroupItem variant="segment" key={value} value={value} className="flex-1">{value === 'system' ? 'System' : value === 'reduce' ? 'Reduce' : 'Full'}</RadioGroupItem>)}
      </RadioGroup>}
    </Segmented>
    <RecordList heading="Alerts">
      <SwitchRow media={<DesignIcon name="clock" strokeWidth={1.6} />} title="Timer alerts in the app" fact="Reminders while the app is open." on={appearance.alerts !== false} onToggle={() => onChange({ alerts: appearance.alerts === false })} />
    </RecordList>
  </>
}

function Units() {
  const { system, choice, setChoice } = useUnits()
  return <UnitsView system={system} choice={choice} onChange={setChoice} />
}

export function UnitsView({ system, choice, onChange }: { system: UnitSystem; choice: UnitChoice; onChange: (choice: UnitChoice) => void }) {
  const caption = choice === 'auto' ? settingsText.followingRegion(settingsText.unitDescriptions[system]) : settingsText.chosenUnits(settingsText.doseUnits[choice])
  return <Segmented label={settingsText.units} caption={caption}>
    {(labelId) => <RadioGroup variant="segment" value={choice} onValueChange={(value) => onChange(value as UnitChoice)} aria-labelledby={labelId} className="w-full">
      {(['auto', 'imperial', 'metric'] as const).map((value) => <RadioGroupItem variant="segment" key={value} value={value} className="flex-1">{settingsText.unitChoices[value]}</RadioGroupItem>)}
    </RadioGroup>}
  </Segmented>
}
