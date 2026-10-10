import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { intakeHousehold, newBackend, signedIn, type Backend } from './harness.testing'
import { removePrincipalData } from './identity'
import { hasEmbeddedMetadata, signViewToken, sniffImageType, verifyViewToken } from './photos'
import { principalFromAuth } from './principal'

const jpegHeader = [0xff, 0xd8, 0xff]
const jfif = [0xff, 0xe0, 0x00, 0x10, ...'JFIF'.split('').map((char) => char.charCodeAt(0)), 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
const exif = [0xff, 0xe1, 0x00, 0x10, ...'Exif'.split('').map((char) => char.charCodeAt(0)), 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]
const startOfScan = [0xff, 0xda, 0x00, 0x02]
const bytes = (values: number[]) => Uint8Array.from(values)

beforeEach(() => { vi.stubEnv('WASHCLOSET_PHOTO_URL_SECRET', 'test-photo-url-secret-that-is-long-enough') })
afterEach(() => { vi.unstubAllEnvs() })

test('photo type comes from the bytes, not the claimed content type', () => {
  expect(sniffImageType(bytes([...jpegHeader.slice(0, 2), ...jfif]))).toBe('image/jpeg')
  expect(sniffImageType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
  expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
  expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull()
  expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull()
})

test('photos still carrying camera metadata are detected', () => {
  expect(hasEmbeddedMetadata(bytes([0xff, 0xd8, ...jfif, ...startOfScan]), 'image/jpeg')).toBe(false)
  expect(hasEmbeddedMetadata(bytes([0xff, 0xd8, ...jfif, ...exif, ...startOfScan]), 'image/jpeg')).toBe(true)
})

test('view links expire, cannot be altered, and name their viewer', async () => {
  const now = 1_000_000
  const token = await signViewToken({ photoId: 'photo-1', principalKey: 'principal:v1:viewer', expiresAt: now + 60_000 })
  expect(await verifyViewToken(token, now)).toEqual({ photoId: 'photo-1', principalKey: 'principal:v1:viewer' })
  expect(await verifyViewToken(token, now + 60_001)).toBeNull()
  const [body, signature] = token.split('.')
  const forged = btoa(JSON.stringify({ photoId: 'photo-2', principalKey: 'principal:v1:viewer', expiresAt: now + 60_000 })).replaceAll('=', '')
  expect(await verifyViewToken(`${forged}.${signature}`, now)).toBeNull()
  expect(await verifyViewToken(`${body}.${signature}x`, now)).toBeNull()

  vi.stubEnv('WASHCLOSET_PHOTO_URL_SECRET', '')
  await expect(signViewToken({ photoId: 'photo-1', principalKey: 'x', expiresAt: now })).rejects.toThrow('not configured')
})

const cleanJpeg = () => new Blob([bytes([0xff, 0xd8, ...jfif, ...startOfScan])], { type: 'image/jpeg' })

async function householdWithPhoto(t: Backend) {
  const owner = signedIn(t, 'photo-owner')
  const home = await intakeHousehold(owner)
  const ownerKey = await owner.run((ctx) => principalFromAuth(ctx.auth).then((principal) => principal.key as string))
  const storageId = await t.run((ctx) => ctx.storage.store(cleanJpeg()))
  const photoId = await owner.action(api.photos.attach, { textileId: home.shirt, storageId })
  return { owner, home, photoId, storageId, ownerKey }
}

const stored = (t: Backend, storageId: Id<'_storage'>) =>
  t.run(async (ctx) => (await ctx.db.system.get(storageId)) !== null)

test('an outsider cannot attach or delete a household photo by guessing its storage id', async () => {
  const t = newBackend()
  const { home, storageId } = await householdWithPhoto(t)
  const outsider = signedIn(t, 'outsider')
  await expect(outsider.action(api.photos.attach, { textileId: home.shirt, storageId })).rejects.toThrow('Forbidden')
  expect(await stored(t, storageId)).toBe(true)
  // Re-attaching an attached photo is refused without touching its bytes.
  await expect(signedIn(t, 'photo-owner').action(api.photos.attach, { textileId: home.towel, storageId })).rejects.toThrow('already attached')
  expect(await stored(t, storageId)).toBe(true)
})

test('an upload that fails validation after authorization is deleted', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'photo-owner')
  const home = await intakeHousehold(owner)
  const withExif = await t.run((ctx) => ctx.storage.store(new Blob([bytes([0xff, 0xd8, ...jfif, ...exif, ...startOfScan])])))
  await expect(owner.action(api.photos.attach, { textileId: home.shirt, storageId: withExif })).rejects.toThrow('camera metadata')
  expect(await stored(t, withExif)).toBe(false)
})

test('delivery requires current membership, so removal ends photo access', async () => {
  const t = newBackend()
  const { home, photoId, storageId, ownerKey } = await householdWithPhoto(t)
  await expect(t.query(internal.photos.deliverable, { photoId, principalKey: ownerKey })).resolves.toMatchObject({ storageId })
  await expect(t.query(internal.photos.deliverable, { photoId, principalKey: 'principal:v1:outsider' })).resolves.toBeNull()
  await t.run(async (ctx) => {
    for (const membership of await ctx.db.query('memberships').collect()) if (membership.householdId === home.householdId) await ctx.db.delete(membership._id)
  })
  await expect(t.query(internal.photos.deliverable, { photoId, principalKey: ownerKey })).resolves.toBeNull()
})

test('deleting a garment deletes its photo bytes', async () => {
  const t = newBackend()
  const { owner, home, photoId, storageId } = await householdWithPhoto(t)
  await owner.mutation(api.inventory.deleteTextile, { textileId: home.shirt })
  expect(await stored(t, storageId)).toBe(false)
  expect(await t.run(async (ctx) => [await ctx.db.get(photoId), await ctx.db.get(home.shirt)])).toEqual([null, null])
})

test('deleting an account deletes the photos that person uploaded', async () => {
  const t = newBackend()
  const { photoId, storageId, ownerKey } = await householdWithPhoto(t)
  await t.run((ctx) => removePrincipalData(ctx, ownerKey))
  expect(await stored(t, storageId)).toBe(false)
  expect(await t.run((ctx) => ctx.db.get(photoId))).toBeNull()
})
