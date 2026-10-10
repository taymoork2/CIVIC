/** Match interchangeable clothes by style and wearer, never by a physical piece. */
export function outfitGroupKey(item: {
  name: string; color?: string | null; colorGroup?: string | null; kind?: string | null;
  wearerId?: string | null; identity?: { brand?: string | null } | null;
}): string {
  const words = (value?: string | null) => (value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
  return JSON.stringify([words(item.name), words(item.color) || words(item.colorGroup), item.kind ?? '', item.wearerId ?? '', words(item.identity?.brand)])
}
