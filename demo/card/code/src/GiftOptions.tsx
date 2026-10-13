import { Button } from '@fluentui/react-button'
import { GiftOption } from './GiftOption'

export function GiftOptions({ onBack }: { onBack: () => void }) {
  return (
    <section aria-label="Gift options">
      <GiftOption title="Gift wrap" price="$4" />
      <GiftOption title="Gift message" price="Free" />
      <Button onClick={onBack}>Back to order</Button>
    </section>
  )
}
