/** A fraction of a printed fill level is not a fraction of its calibrated volume. */
export function markFractionProblem(dose: { amount: number; unit: string; mark?: string | null; fractionOfMark?: number }): string | null {
  if (dose.fractionOfMark === undefined) return null
  if (!['cap', 'scoop'].includes(dose.unit) || typeof dose.mark !== 'string' || !dose.mark.trim()) return 'Only a cap or scoop dose with a printed mark can name a fraction of that mark.'
  if (!Number.isFinite(dose.fractionOfMark) || dose.fractionOfMark <= 0 || dose.fractionOfMark > 1) return 'A fraction of a mark must be more than zero and no more than one.'
  if (!Number.isInteger(dose.amount) || dose.amount < 1 || dose.amount > 4) return 'Partial-mark directions need a whole number of fills from 1 to 4.'
  return null
}

/** Native fill-level proportion; this never estimates a volume. */
export function fractionOfMarkText(fraction: number): string {
  const known: Record<string, string> = { '0.25': '1/4', '0.5': '1/2', '0.75': '3/4', '0.8': '4/5' }
  return known[String(fraction)] ?? `${Number((fraction * 100).toFixed(6))}%`
}
