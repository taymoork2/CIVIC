import { sessionText } from '@/copy'

/** A washer's own name, without the sample fixture's grouping word. */
export function washerName(name: string | null): string {
  return name === null ? sessionText.theWasher : name.replace(/ pool$/i, '')
}
