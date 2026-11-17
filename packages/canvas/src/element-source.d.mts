export interface ElementSource {
  location?: string
  file?: string
  line?: number
  column?: number
  via?: 'civic' | 'vue-inspector' | 'svelte-inspector' | 'solid-locator'
  match?: 'exact' | 'ancestor'
  component?: string
}
export function readElementSource(element: Element, build?: { root?: string }): ElementSource
