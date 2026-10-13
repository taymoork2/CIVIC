import { Button } from '@fluentui/react-button'
import { Card, CardFooter, CardHeader } from '@fluentui/react-card'
import type { Order } from './order'

export function OrderSummary({ order, onApplyPromotion, onContinue }: { order: Order; onApplyPromotion: () => void; onContinue: () => void }) {
  return (
    <section aria-label="Order summary">
      <Card appearance="filled" selected={order.selected} onSelectionChange={order.toggle}>
        <CardHeader header={<b>Your order</b>} description={`${order.items.length} items`} action={<Button appearance="subtle">Edit</Button>} />
        <p>{order.total}</p>
        <CardFooter>
          <Button onClick={onApplyPromotion}>Apply promotion</Button>
        </CardFooter>
      </Card>
      <Button appearance="primary" onClick={onContinue}>
        Continue to payment
      </Button>
    </section>
  )
}
