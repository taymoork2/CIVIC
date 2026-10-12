import { garmentPrivacyText } from '@/copy-closet'
import { Button } from '@/components/ui/button'
import { RecordRow } from '@/kit/record-row'
import { HelpTip } from '@/kit/help-tip'
import { SwitchMark } from '@/laundry/laundry-ui'

export function GarmentPrivacy({ on, onChange, disabled }: { on: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
  return <ul className="m-0 list-none p-0">
    <RecordRow title={<span className="flex items-center gap-1">{garmentPrivacyText.title}<HelpTip topic={garmentPrivacyText.title}>{garmentPrivacyText.tip}</HelpTip></span>}
      trailing={<Button type="button" variant="ghost" className="min-h-11 px-2" role="switch" aria-label={garmentPrivacyText.title} aria-checked={on} disabled={disabled} onClick={() => { if (!disabled) onChange(!on) }}><SwitchMark on={on} /></Button>} />
  </ul>
}
