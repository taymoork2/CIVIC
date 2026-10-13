import { Card } from './vendor/react-card/Card'

export function PromoApplied({ discount }: { discount: string }) {
  return (
    <section aria-label="Promotion applied">
      <p>Promotion applied</p>
      <Card illustration={<img src="/promo.svg" alt="" />}>
        <h3>Promotion applied</h3>
        <p>Your {discount} discount is on the order total.</p>
      </Card>
    </section>
  )
}
