import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAction as useConvexAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { carePhotoText } from '@/copy'
import { ErrorNotice, errorMessage } from '@/kit/ui'

const photosClassName = cn(
  "photos",
  "grid gap-2 pt-3",
  "[border-block-start:1px_solid_var(--rule)]",
)

const mutedClassName = cn(
  "muted",
  "text-ink-2",
)

const smallClassName = cn(
  "small",
  "text-[length:var(--step--1)]",
)

const photoListClassName = cn(
  "photo-list",
  "grid gap-1",
  "[&_li]:flex [&_li]:items-center [&_li]:gap-2",
)

const secondaryButtonClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  "[&.danger]:text-destructive",
)

const photoViewClassName = cn(
  "photo-view",
  "max-w-full rounded-field",
  "[border:var(--rule-width)_solid_var(--line)]",
)

const fileButtonClassName = cn(
  "file-button",
  "relative",
  "[justify-self:start]",
  "[&_input]:absolute [&_input]:opacity-0 [&_input]:cursor-[pointer]",
  "[&_input]:[inset:0]",
  "[&:has(input:focus-visible)]:[outline:3px_solid_var(--focus)]",
  "[&:has(input:focus-visible)]:[outline-offset:2px]",
)

const maxDimension = 2000

/** WebKit can add EXIF to a canvas JPEG. Remove APP1 segments without touching its pixels. */
export async function removeJpegMetadata(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(carePhotoText.readFailure)
  const parts: Blob[] = [blob.slice(0, 2)]
  let offset = 2
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]
    if (marker === 0xda || marker === 0xd9) return new Blob([...parts, blob.slice(offset)], { type: 'image/jpeg' })
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    const end = offset + 2 + length
    if (length < 2 || end > bytes.length) break
    if (marker !== 0xe1) parts.push(blob.slice(offset, end))
    offset = end
  }
  throw new Error(carePhotoText.readFailure)
}

/**
 * Re-encodes a photo through a canvas. The output keeps only pixels: EXIF blocks with
 * camera details and GPS location are not carried over, and the orientation is applied.
 */
export async function stripPhotoMetadata(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(carePhotoText.readFailure))), 'image/jpeg', 0.85))
  return removeJpegMetadata(jpeg)
}

export type PhotoCalls = {
  readonly generateUploadUrl: (args: { textileId: Id<'textiles'> }) => Promise<string>
  readonly attach: (args: { textileId: Id<'textiles'>; storageId: Id<'_storage'> }) => Promise<unknown>
}

/** Uploads one care-label photo for a garment, with its camera details removed first. */
export async function uploadCarePhoto(calls: PhotoCalls, textileId: Id<'textiles'>, file: File): Promise<void> {
  const clean = await stripPhotoMetadata(file)
  const uploadUrl = await calls.generateUploadUrl({ textileId })
  const response = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': clean.type }, body: clean })
  if (!response.ok) throw new Error(carePhotoText.uploadFailure)
  const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
  await calls.attach({ textileId, storageId })
}

export function CarePhotos({ textileId }: { textileId: Id<'textiles'> }) {
  const photos = useQuery(api.photos.list, { textileId })
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl)
  const attach = useConvexAction(api.photos.attach)
  const issueViewUrl = useMutation(api.photos.issueViewUrl)
  const remove = useMutation(api.photos.remove)
  const [viewing, setViewing] = useState<{ photoId: string; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const upload = (file: File) => run(() => uploadCarePhoto({ generateUploadUrl, attach }, textileId, file))

  return (
    <section className={photosClassName} aria-label={carePhotoText.title}>
      <h3>{carePhotoText.title}</h3>
      <p className={cn(mutedClassName, smallClassName)}>{carePhotoText.privacy}</p>
      {photos === undefined ? null : (
        <ul className={photoListClassName}>
          {photos.map((photo, index) => (
            <li key={photo.photoId}>
              <span>{carePhotoText.photoNumber(index + 1)}</span>
              <Button variant="unstyled" size="unstyled" className={secondaryButtonClassName} type="button" disabled={busy} onClick={() => void run(async () => {
                const issued = await issueViewUrl({ photoId: photo.photoId })
                setViewing({ photoId: photo.photoId, url: issued.url })
              })}>{carePhotoText.view}</Button>
              <Button variant="unstyled" size="unstyled" className={cn(secondaryButtonClassName, "danger")} type="button" disabled={busy} onClick={() => void run(async () => {
                if (!window.confirm(carePhotoText.confirmDelete)) return
                await remove({ photoId: photo.photoId })
                if (viewing?.photoId === photo.photoId) setViewing(null)
              })}>{carePhotoText.delete}</Button>
            </li>
          ))}
        </ul>
      )}
      {viewing ? <img className={photoViewClassName} src={viewing.url} alt={carePhotoText.imageAlt} referrerPolicy="no-referrer" onError={() => setViewing(null)} /> : null}
      {(photos?.length ?? 0) < 3 ? (
        <label className={cn(secondaryButtonClassName, fileButtonClassName)}>
          {busy ? carePhotoText.working : carePhotoText.add}
          <Input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file !== undefined) void upload(file)
          }} />
        </label>
      ) : null}
      <ErrorNotice error={error} />
    </section>
  )
}
