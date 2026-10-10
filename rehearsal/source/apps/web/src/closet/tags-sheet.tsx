import { normalizeClothingTags } from '@washcloset/planner'
import { useState } from 'react'

import { ClothingTagsEditor } from '@/closet/clothing-tags'
import { Button } from '@/components/ui/button'
import { garmentRecordCaveats } from '@/copy-closet'
import { IssueNote } from '@/kit/record-row'
import { Sheet } from '@/kit/sheet'
import { TaskFooter } from '@/kit/task-footer'
import { errorMessage } from '@/kit/ui'

/** Writes tags on every piece of a garment; tags only group clothes and never change care. */
export type TagsCall = (args: { textileIds: readonly string[]; tags: readonly string[] }) => Promise<unknown>

const sameTags = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((tag, index) => tag === right[index])

/**
 * "Edit tags": just the tags of one garment, apart from the full details form. Close changes
 * nothing; with unsaved edits it asks before discarding.
 */
export function TagsSheet({ name, kind, textileIds, initial, knownTags, save, onClose, onSaved }: {
  name: string
  kind?: string | null
  textileIds: readonly string[]
  initial: readonly string[]
  knownTags: readonly string[]
  save: TagsCall
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [tags, setTags] = useState<readonly string[]>(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = !sameTags(normalizeClothingTags([...tags]), normalizeClothingTags([...initial]))
  const commit = async () => {
    if (pending || !dirty) return
    setPending(true)
    setError(null)
    try {
      await save({ textileIds, tags: normalizeClothingTags([...tags]) })
      onSaved(garmentRecordCaveats.tagsSaved)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }
  return <Sheet title="Tags" onClose={onClose} dirty={dirty} closeAtTop
    footer={<>
      <TaskFooter><Button size="lg" disabled={pending || !dirty} onClick={() => void commit()}>{pending ? 'Saving…' : garmentRecordCaveats.tagsSave}</Button></TaskFooter>
    </>}>
    <p className="m-0 break-words text-ink-2">{name}</p>
    {error === null ? null : <IssueNote kind="conflict" title={error} actions={[]} />}
    <fieldset disabled={pending} className="m-0 min-w-0 border-0 p-0" aria-label="Edit tags">
      <ClothingTagsEditor kind={kind} values={tags} knownTags={knownTags} onChange={setTags} standalone />
    </fieldset>
  </Sheet>
}
