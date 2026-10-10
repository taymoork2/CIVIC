import { expect, test } from 'vitest'
import { removeJpegMetadata } from '@/closet/care-photos'

test('canvas JPEG cleanup removes EXIF/XMP while retaining image segments and rejects malformed lengths', async () => {
  const start = [0xff, 0xd8]
  const image = [0xff, 0xdb, 0, 3, 7, 0xff, 0xda, 0, 2, 11, 0xff, 0xd9]
  const app1 = [0xff, 0xe1, 0, 6, ...new TextEncoder().encode('Exif')]
  const clean = await removeJpegMetadata(new Blob([new Uint8Array([...start, ...app1, ...app1, ...image])]))
  expect(clean.type).toBe('image/jpeg')
  expect([...new Uint8Array(await clean.arrayBuffer())]).toEqual([...start, ...image])
  await expect(removeJpegMetadata(new Blob([new Uint8Array([...start, 0xff, 0xe1, 0, 1])]))).rejects.toThrow()
})
