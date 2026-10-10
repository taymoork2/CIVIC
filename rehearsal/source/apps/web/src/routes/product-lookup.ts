import { createFileRoute } from '@tanstack/react-router'

/** Public barcode identity only. Dose lines and warnings must come from the user's label. */
export const Route = createFileRoute('/product-lookup')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const barcode = new URL(request.url).searchParams.get('barcode') ?? ''
        if (!/^\d{8,14}$/.test(barcode)) return Response.json({ error: 'Enter an 8–14 digit barcode.' }, { status: 400 })
        try {
          const upstream = await fetch(`https://world.openproductsfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,categories_tags`, {
            headers: { 'user-agent': 'WashCloset/0.1 (barcode identity lookup)' },
            signal: AbortSignal.timeout(6000),
          })
          if (!upstream.ok) throw new Error('Catalog unavailable')
          const result: unknown = await upstream.json()
          if (typeof result !== 'object' || result === null || !('status' in result) || result.status !== 1 || !('product' in result) || typeof result.product !== 'object' || result.product === null) {
            return Response.json({ error: 'No product found for that barcode.' }, { status: 404 })
          }
          const product = result.product as Record<string, unknown>
          const words = (value: unknown) => typeof value === 'string' ? value.slice(0, 120).trim() : ''
          const categories = Array.isArray(product.categories_tags) ? product.categories_tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 20) : []
          const brand = words(product.brands).split(',')[0]!.trim()
          const productName = words(product.product_name)
          const name = productName.toLowerCase().startsWith(brand.toLowerCase()) ? productName : [brand, productName].filter(Boolean).join(' ')
          if (name === '') return Response.json({ error: 'The catalog has no name for this barcode.' }, { status: 404 })
          return Response.json({ name, categories }, { headers: { 'cache-control': 'public, max-age=3600' } })
        } catch {
          return Response.json({ error: 'Product lookup is unavailable. You can enter the label by hand.' }, { status: 502 })
        }
      },
    },
  },
})
