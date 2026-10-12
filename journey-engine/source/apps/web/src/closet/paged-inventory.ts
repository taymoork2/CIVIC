import { usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { api } from '@/api'

export type BrowseArgs = FunctionArgs<typeof api.inventoryBrowse.summary>

export function usePagedInventory(args: BrowseArgs | 'skip') {
  const summary = useQuery(api.inventoryBrowse.summary, args)
  const pages = usePaginatedQuery(api.inventoryBrowse.page, args, { initialNumItems: 40 })
  // A renamed group can move into an earlier reactive range while both ranges update.
  const pieces = [...new Map(pages.results.map(piece => [piece.textileId, piece])).values()]
  return { summary, pieces, loading: summary === undefined || pages.status === 'LoadingFirstPage', more: pages.status === 'CanLoadMore', loadingMore: pages.status === 'LoadingMore', loadMore: () => pages.loadMore(40) }
}
