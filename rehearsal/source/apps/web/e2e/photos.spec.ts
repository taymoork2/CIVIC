import { expect, test, type Page } from '@playwright/test'

import { addClothes, closetRows, createHousehold, signInAs } from './flows'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

const api = anyApi as any
const convexUrl = process.env.WASHCLOSET_E2E_CONVEX_URL ?? 'http://127.0.0.1:3210'

// 1×1 PNG; the app re-encodes it to a metadata-free JPEG before upload.
const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
// A JPEG that still carries an EXIF block, as a camera would write it.
const exifJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9])

async function signUpWithHousehold(page: Page, who: string) {
  await signInAs(page, who.toLowerCase(), who)
  await createHousehold(page)
}

/** A Convex client acting as the page's signed-in person, using the same auth endpoint the app uses. */
async function convexAs(page: Page) {
  const response = await page.request.get('/api/auth/convex/token')
  const { token } = (await response.json()) as { token: string }
  const client = new ConvexHttpClient(convexUrl)
  client.setAuth(token)
  return client
}

async function uploadRaw(client: ConvexHttpClient, textileId: string, bytes: Buffer, type: string) {
  const uploadUrl = await client.mutation(api.photos.generateUploadUrl, { textileId })
  const response = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': type }, body: bytes })
  const { storageId } = (await response.json()) as { storageId: string }
  return client.action(api.photos.attach, { textileId, storageId })
}

test('U7: care-label photos are private, validated by content, short-lived to view, and deleted with the garment', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  await signUpWithHousehold(owner, 'Photographer')
  await addClothes(owner, { name: 'Silk scarf', kind: 'other', target: 'closet' })
  await closetRows(owner, 'Silk scarf').click()
  // Care owns the label photo; its extras editor opens over the record.
  const record = owner.getByRole('dialog', { name: 'Silk scarf', exact: true })
  await record.getByRole('tab', { name: 'Care', exact: true }).click()
  await record.getByRole('button', { name: /More on the label/ }).click()
  const row = owner.getByRole('dialog', { name: 'More on the label', exact: true })

  // Upload through the app: accepted after the browser strips metadata.
  await row.locator('input[type=file]').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: pixelPng })
  await expect(row.getByText('Photo 1')).toBeVisible()
  await row.getByRole('button', { name: 'View' }).click()
  const image = row.getByRole('img', { name: 'Care label' })
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
  const viewUrl = new URL((await image.getAttribute('src'))!, owner.url()).toString()
  const served = await fetch(viewUrl)
  expect(served.status).toBe(200)
  expect(served.headers.get('content-type')).toBe('image/jpeg')
  expect(served.headers.get('cache-control')).toContain('no-store')

  // Direct uploads that bypass the app are judged by their bytes.
  const client = await convexAs(owner)
  const { textiles } = await client.query(api.inventory.list, { householdId: (await client.query(api.households.onboardingStatus, {})).households[0].householdId })
  const textileId = textiles.find((textile: { name: string }) => textile.name === 'Silk scarf').textileId
  await expect(uploadRaw(client, textileId, exifJpeg, 'image/jpeg')).rejects.toThrow('camera metadata')
  await expect(uploadRaw(client, textileId, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/jpeg')).rejects.toThrow('Only JPEG, PNG, or WebP')

  // Another household cannot list, link, or fetch the photo.
  const outsider = await (await browser.newContext()).newPage()
  await signUpWithHousehold(outsider, 'Stranger')
  const outsiderClient = await convexAs(outsider)
  const [photo] = await client.query(api.photos.list, { textileId })
  await expect(outsiderClient.query(api.photos.list, { textileId })).rejects.toThrow('Forbidden')
  await expect(outsiderClient.mutation(api.photos.issueViewUrl, { photoId: photo.photoId })).rejects.toThrow('Forbidden')
  expect((await fetch(viewUrl.replace(/token=[^&]+/, 'token=forged.token'))).status).toBe(404)

  // Deleting the garment deletes the stored bytes; the old link stops working.
  // Trash retains photos during its restore period; this is permanent deletion of this test garment.
  await client.mutation(api.inventory.deleteTextile, { textileId })
  await expect.poll(async () => (await fetch(viewUrl)).status).toBe(404)
  expect((await fetch(viewUrl)).status).toBe(404)
  await Promise.all([owner.context().close(), outsider.context().close()])
})
