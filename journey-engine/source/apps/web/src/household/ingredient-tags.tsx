import { TagEditor } from '@/kit/tag-editor'
import { peopleCopy } from '@/copy-household'

/** Match the server's ingredient list limits; punctuation belongs to the name. */
export function normalizeIngredientNames(values: readonly string[]): string[] {
  if (values.length > 60) throw new Error('List at most 60 ingredients.')
  const names = new Map<string, string>()
  for (const value of values) {
    const name = value.trim()
    if (!name || name.length > 80) throw new Error('Ingredient names must be 1–80 characters.')
    if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name)
  }
  return [...names.values()]
}

export function IngredientTagsEditor({ values, onChange, inputValue, onInputChange }: { values: readonly string[]; onChange: (values: string[]) => void; inputValue: string; onInputChange: (value: string) => void }) {
  return <TagEditor values={values} onChange={onChange} inputValue={inputValue} onInputChange={onInputChange}
    hint={inputValue.trim() ? 'Add this ingredient before saving.' : peopleCopy.avoidHint}
    words={{ label: peopleCopy.avoid, placeholder: 'Add an ingredient', add: 'Add' }}
    rules={{ maxCount: 60, maxLength: 80, normalize: normalizeIngredientNames }} />
}
