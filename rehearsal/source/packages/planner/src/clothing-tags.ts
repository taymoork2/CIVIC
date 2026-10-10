import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity'

export const clothingTagSuggestions = ['Everyday', 'Work', 'Dressy', 'Sport', 'Sleep', 'Lounge', 'Weekend', 'Travel', 'Outdoors', 'Warm weather', 'Cold weather', 'Layering', 'Favorite', 'Uniform'] as const
export const maxClothingTags = 12
export const maxClothingTagLength = 32

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })

/** Shared by intake and the server; custom tags stay within the household's inventory. */
export function normalizeClothingTags(values: readonly string[]): string[] {
  if (values.length > maxClothingTags) throw new Error(`Choose up to ${maxClothingTags} tags.`)
  const tags = new Map<string, string>()
  for (const value of values) {
    const tag = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    if (!tag || tag.length > maxClothingTagLength || /[\p{Cc}\p{Cf}]/u.test(tag)) throw new Error(`Tags must be 1–${maxClothingTagLength} characters without hidden characters.`)
    // ponytail: English word-list checking; add locale datasets when we support other languages.
    if (matcher.hasMatch(tag)) throw new Error('Please choose a tag without offensive language.')
    const key = tag.toLowerCase()
    if (!tags.has(key)) tags.set(key, tag)
  }
  return [...tags.values()].sort((a, b) => a.localeCompare(b))
}

/** Preserve explicitly assigned legacy occasions, without guessing tags from clothing type. */
export function clothingTags(item: { readonly tags?: readonly string[]; readonly occasions?: readonly string[] | null }): readonly string[] {
  return item.tags ?? (item.occasions ?? []).map((tag) => tag.charAt(0).toUpperCase() + tag.slice(1))
}

export function usedClothingTags(items: readonly Parameters<typeof clothingTags>[0][]): string[] {
  const tags = new Map<string, string>()
  for (const item of items) for (const tag of clothingTags(item)) if (!tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag)
  return [...tags.values()].sort((a, b) => a.localeCompare(b))
}
