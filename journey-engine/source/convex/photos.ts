import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server'
import { authorize, authorizeKey } from './access'
import { fail } from './errors'
import { principalFromAuth } from './principal'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

const maxBytes = 5 * 1024 * 1024
const maxPhotosPerTextile = 3
const viewLifetimeMs = 5 * 60 * 1000

export type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp'

/** Identifies the actual image type from its first bytes; the uploader's claimed type is not trusted. */
export function sniffImageType(bytes: Uint8Array): PhotoType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return 'image/png'
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Metadata or malformed chunks fail closed: their location data cannot be ruled out. */
export function hasEmbeddedMetadata(bytes: Uint8Array, type: PhotoType): boolean {
  const text = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length))
  if (type === 'image/jpeg') {
    let offset = 2
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1]!
      if (marker === 0xda || marker === 0xd9) break
      const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
      if (length < 2 || offset + 2 + length > bytes.length) return true
      if (marker === 0xe1 && (text(offset + 4, 4) === 'Exif' || text(offset + 4, 28).startsWith('http://ns.adobe.com/xap'))) return true
      offset += 2 + length
    }
    return false
  }
  if (type === 'image/png') {
    let offset = 8
    while (offset + 8 <= bytes.length) {
      const length = ((bytes[offset]! << 24) >>> 0) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!
      if (offset + 12 + length > bytes.length) return true
      const chunk = text(offset + 4, 4)
      if (chunk === 'eXIf' || chunk === 'iTXt' || chunk === 'zTXt' || chunk === 'tEXt') return true
      if (chunk === 'IEND') break
      offset += 12 + length
    }
    return false
  }
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunk = text(offset, 4)
    const length = (bytes[offset + 4]! | (bytes[offset + 5]! << 8) | (bytes[offset + 6]! << 16) | (bytes[offset + 7]! << 24)) >>> 0
    if (offset + 8 + length + (length % 2) > bytes.length) return true
    if (chunk === 'EXIF' || chunk === 'XMP ') return true
    offset += 8 + length + (length % 2)
  }
  return false
}

// ---- Upload ----------------------------------------------------------------

export const generateUploadUrl = mutation({
  args: { textileId: v.id('textiles') },
  returns: v.string(),
  handler: async (ctx, args) => {
    await authorize(ctx, 'photo.edit', { textileId: args.textileId })
    return ctx.storage.generateUploadUrl()
  },
})

export const uploadContext = internalQuery({
  args: { textileId: v.id('textiles'), storageId: v.id('_storage') },
  returns: v.object({ householdId: v.id('households'), principalKey: v.string(), count: v.number(), attached: v.boolean() }),
  handler: async (ctx, args) => {
    const textile = (await authorize(ctx, 'photo.edit', { textileId: args.textileId })).textile
    const actor = await principalFromAuth(ctx)
    const existing = await ctx.db.query('carePhotos').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).collect()
    const attached = await ctx.db.query('carePhotos').withIndex('by_storage', (q) => q.eq('storageId', args.storageId)).first()
    return { householdId: textile.householdId, principalKey: actor.key as string, count: existing.length, attached: attached !== null }
  },
})

export const insertPhoto = internalMutation({
  args: { textileId: v.id('textiles'), storageId: v.id('_storage'), contentType: v.string(), size: v.number() },
  returns: v.id('carePhotos'),
  handler: async (ctx, args) => {
    const { textile, actor } = await authorize(ctx, 'photo.edit', { textileId: args.textileId })
    const attached = await ctx.db.query('carePhotos').withIndex('by_storage', q => q.eq('storageId', args.storageId)).first()
    if (attached !== null) {
      if (attached.textileId === textile._id && attached.householdId === textile.householdId && attached.uploadedBy === actor.key) return attached._id
      fail('conflict', 'This photo is already attached')
    }
    const existing = await ctx.db.query('carePhotos').withIndex('by_textile', q => q.eq('textileId', textile._id)).take(maxPhotosPerTextile)
    if (existing.length >= maxPhotosPerTextile) fail('invalid', `A garment can have at most ${maxPhotosPerTextile} photos`)
    const blob = await ctx.db.system.get(args.storageId)
    if (blob === null) fail('not_found', 'Upload not found')
    if (blob.size !== args.size || args.size > maxBytes) fail('invalid', 'Upload size changed')
    return ctx.db.insert('carePhotos', { ...args, householdId: textile.householdId, uploadedBy: actor.key, createdAt: Date.now() })
  },
})

export const discardRejected = internalMutation({
  args: { textileId: v.id('textiles'), storageId: v.id('_storage') }, returns: v.null(),
  handler: async (ctx, args) => {
    await authorize(ctx, 'photo.edit', { textileId: args.textileId })
    const attached = await ctx.db.query('carePhotos').withIndex('by_storage', q => q.eq('storageId', args.storageId)).first()
    if (attached === null) await ctx.storage.delete(args.storageId)
    return null
  },
})

/**
 * Validates an uploaded care-label photo by its bytes and records it privately.
 * The caller is authorized first; only then is a rejected upload deleted rather than left orphaned,
 * and never one that is already attached to a garment.
 */
export const attach = action({
  args: { textileId: v.id('textiles'), storageId: v.id('_storage') },
  returns: v.id('carePhotos'),
  handler: async (ctx, args): Promise<Id<'carePhotos'>> => {
    const reject = async (message: string): Promise<never> => {
      await ctx.runMutation(internal.photos.discardRejected, args)
      fail('invalid', message)
    }
    const context = await ctx.runQuery(internal.photos.uploadContext, { textileId: args.textileId, storageId: args.storageId }).catch(() => null)
    if (context === null) fail('forbidden', 'Forbidden')
    if (!context.attached && context.count >= maxPhotosPerTextile) return reject(`A garment can have at most ${maxPhotosPerTextile} photos`)
    const blob = await ctx.storage.get(args.storageId)
    if (blob === null) fail('not_found', 'Upload not found')
    if (blob.size > maxBytes) return reject('Photos must be 5 MB or smaller')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const type = sniffImageType(bytes)
    if (type === null) return reject('Only JPEG, PNG, or WebP photos are accepted')
    if (hasEmbeddedMetadata(bytes, type)) return reject('Photo is malformed or still contains camera metadata; upload it through the app so location data is removed')
    return ctx.runMutation(internal.photos.insertPhoto, {
      textileId: args.textileId,
      storageId: args.storageId,
      contentType: type,
      size: blob.size,
    })
  },
})

// ---- Listing, viewing, deleting --------------------------------------------

export const list = query({
  args: { textileId: v.id('textiles') },
  returns: v.array(v.object({ photoId: v.id('carePhotos'), contentType: v.string(), size: v.number(), createdAt: v.number() })),
  handler: async (ctx, args) => {
    const textile = (await authorize(ctx, 'textile.read', { textileId: args.textileId })).textile
    const photos = await ctx.db.query('carePhotos').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).collect()
    return photos.map((photo) => ({ photoId: photo._id, contentType: photo.contentType, size: photo.size, createdAt: photo.createdAt }))
  },
})

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function signingKey(): Promise<CryptoKey> {
  const secret = process.env.WASHCLOSET_PHOTO_URL_SECRET
  if (secret === undefined || secret.length < 32) fail('disabled', 'Photo delivery is not configured')
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export type ViewClaim = { photoId: string; principalKey: string }

export async function signViewToken(payload: ViewClaim & { expiresAt: number }): Promise<string> {
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(body)))
  return `${body}.${base64url(signature)}`
}

export async function verifyViewToken(token: string, now: number): Promise<ViewClaim | null> {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const decode = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0))
  try {
    const valid = await crypto.subtle.verify('HMAC', await signingKey(), decode(signature), new TextEncoder().encode(body))
    if (!valid) return null
    const payload: unknown = JSON.parse(new TextDecoder().decode(decode(body)))
    if (typeof payload !== 'object' || payload === null) return null
    const { photoId, principalKey, expiresAt } = payload as Record<string, unknown>
    if (typeof expiresAt !== 'number' || expiresAt <= now) return null
    if (typeof photoId !== 'string' || typeof principalKey !== 'string') return null
    return { photoId, principalKey }
  } catch {
    return null
  }
}

/** Issues a view link valid for five minutes, bound to the viewer; delivery re-checks membership. */
export const issueViewUrl = mutation({
  args: { photoId: v.id('carePhotos') },
  returns: v.object({ url: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId)
    if (photo === null) fail('not_found', 'Not found')
    const actor = (await authorize(ctx, 'textile.read', { textileId: photo.textileId })).actor
    const expiresAt = Date.now() + viewLifetimeMs
    const token = await signViewToken({ photoId: photo._id, principalKey: actor.key, expiresAt })
    // Same-origin path: the web app proxies it to this deployment, so phones never need the Convex site port.
    return { url: `/care-photo?token=${encodeURIComponent(token)}`, expiresAt }
  },
})

export const deliverable = internalQuery({
  args: { photoId: v.string(), principalKey: v.string() },
  returns: v.union(v.null(), v.object({ storageId: v.id('_storage'), contentType: v.string() })),
  handler: async (ctx, args) => {
    const photoId = ctx.db.normalizeId('carePhotos', args.photoId)
    const photo = photoId === null ? null : await ctx.db.get(photoId)
    if (photo === null) return null
    const textile = await ctx.db.get(photo.textileId)
    if (textile === null || textile.trashedAt !== undefined) return null
    const membership = await authorizeKey(ctx, args.principalKey, 'textile.read', { householdId: photo.householdId, textile })
    return membership === null ? null : { storageId: photo.storageId, contentType: photo.contentType }
  },
})

export async function deletePhotoRows(ctx: Pick<MutationCtx, 'db' | 'storage'>, photos: readonly Doc<'carePhotos'>[]): Promise<void> {
  for (const photo of photos) {
    await ctx.storage.delete(photo.storageId)
    await ctx.db.delete(photo._id)
  }
}

export const remove = mutation({
  args: { photoId: v.id('carePhotos') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId)
    if (photo === null) fail('not_found', 'Not found')
    await authorize(ctx, 'photo.edit', { textileId: photo.textileId })
    await deletePhotoRows(ctx, [photo])
    return null
  },
})
