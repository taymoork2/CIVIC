import { Card, CardHeader } from '@fluentui/react-card'

export function GiftOption({ title, price }: { title: string; price: string }) {
  return (
    <Card appearance="filled">
      <CardHeader header={title} description={price} />
    </Card>
  )
}
