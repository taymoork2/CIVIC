import { clothingTagSuggestions, maxClothingTags, maxClothingTagLength, normalizeClothingTags } from '@washcloset/planner'
import { TagEditor } from '@/kit/tag-editor'

/** Clothing vocabulary stays separate from ingredient names and their limits. */
export function ClothingTagsEditor({ values, knownTags = [], onChange, standalone = false, kind }: { values: readonly string[]; knownTags?: readonly string[]; onChange: (values: string[]) => void; standalone?: boolean; kind?: string | null }) {
  const suggestions = kind === 'towel' ? ['Bathroom', 'Guest', 'Beach', 'Gym', 'Travel'] : kind === 'sheets' ? ['Bedroom', 'Guest', 'Everyday', 'Warm weather', 'Cold weather'] : clothingTagSuggestions
  return <TagEditor values={values} knownValues={knownTags} suggestions={suggestions} onChange={onChange} compact={standalone} hideLabel={standalone}
    words={{ label: 'Tags', placeholder: 'Filter or add a tag', add: 'Add tag', more: 'More tags' }}
    rules={{ maxCount: maxClothingTags, maxLength: maxClothingTagLength, normalize: normalizeClothingTags }} />
}
