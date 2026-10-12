import { useEffect, useId, useRef, useState } from 'react'
import { useConvex } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import { ErrorNotice, errorMessage } from '@/kit/ui'

export type IdentifierResult = FunctionReturnType<typeof api.catalog.findIdentifier>
export type IdentifierCandidate = IdentifierResult['candidates'][number]

export function CatalogLookupResults({ result, market, onMarket, onChoose }: {
  result: IdentifierResult; market: string; onMarket: (market: string) => void; onChoose: (candidate: IdentifierCandidate) => void
}) {
  const id = useId()
  const markets = [...new Set(result.candidates.map(({ variant }) => variant.market))]
  const candidates = result.candidates.filter(({ variant }) => variant.market === market)
  if (result.candidates.length === 0) return <p role="status">No reviewed saved manufacturer details for that identifier. Try the brand lookup or keep entering the pack manually.</p>
  return <div className="grid gap-3 min-w-0">
    <p className="m-0 text-ink-2 break-words">Saved identifier: {result.gtin14}. This does not confirm your pack, formulation or label revision.</p>
    <Field><FieldLabel htmlFor={id}>Market on your pack</FieldLabel><NativeSelect id={id} value={market} onChange={(event) => onMarket(event.target.value)}>
      <option value="">Choose the exact market</option>{markets.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
    </NativeSelect></Field>
    {markets.length > 1 ? <p role="status">This identifier has saved candidates in multiple markets. Check your pack’s market before choosing.</p> : null}
    {candidates.length > 1 ? <p role="status">More than one reviewed variant has this identifier in this market. Compare the variant and label revision; none is selected automatically.</p> : null}
    {candidates.map((candidate) => <Button key={candidate.variant._id} type="button" variant="outline" className="justify-self-start h-auto min-h-11 whitespace-normal break-words text-left" onClick={() => onChoose(candidate)}>
      Review {candidate.product.name} · {candidate.variant.name} · {candidate.variant.market} · {candidate.labelRevision}
    </Button>)}
  </div>
}

export function CatalogIdentifierLookup({ onChoose, onDraftChange }: { onChoose: (candidate: IdentifierCandidate) => void; onDraftChange: (dirty: boolean) => void }) {
  const client = useConvex()
  const id = useId()
  const [identifier, setIdentifier] = useState('')
  const [result, setResult] = useState<IdentifierResult | null>(null)
  const [market, setMarket] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])
  const search = async () => {
    const current = ++request.current
    setPending(true); setError(null); setResult(null); setMarket('')
    try {
      const found = await client.query(api.catalog.findIdentifier, { identifier })
      if (request.current === current) setResult(found)
    } catch (caught) {
      if (request.current === current) setError(errorMessage(caught))
    } finally {
      if (request.current === current) setPending(false)
    }
  }
  return <div className="grid gap-3 min-w-0">
    <Field><FieldLabel htmlFor={`${id}-identifier`}>UPC, EAN or GTIN printed on the pack</FieldLabel><Input id={`${id}-identifier`} inputMode="numeric" maxLength={64} value={identifier} onChange={(event) => {
      request.current++; setIdentifier(event.target.value); setPending(false); setResult(null); setMarket(''); setError(null); onDraftChange(event.target.value !== '')
    }} aria-describedby={`${id}-hint`} /></Field>
    <p id={`${id}-hint`} className="m-0 text-sm text-ink-2">UPC-A, EAN or GTIN: 8, 12, 13 or 14 digits including the check digit. Spaces and hyphens allowed; UPC-E unsupported. Searches reviewed saved details only.</p>
    <Button type="button" variant="outline" className="justify-self-start whitespace-normal" disabled={!identifier.trim() || pending} onClick={() => void search()}>Find by identifier</Button>
    {pending ? <p role="status">Looking for reviewed details…</p> : null}
    <ErrorNotice error={error} />
    {result === null ? null : <CatalogLookupResults result={result} market={market} onMarket={setMarket} onChoose={onChoose} />}
  </div>
}
