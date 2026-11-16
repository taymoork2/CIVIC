import type { Evidence } from '../../graph/src/schema.ts'
import type { CivicRun } from '../../review/src/playwright-reporter.ts'

// Preserve Playwright configurations while review owns the reporter lifecycle.
export { default, type CivicReporterOptions, type CivicRun } from '../../review/src/playwright-reporter.ts'

/** Reads a run the reporter wrote, for a project build to assemble into its graph. */
export function readCivicRun(run: unknown): Evidence[] {
  const value = run as Partial<CivicRun>
  if (value?.schema !== 'civic.run/0' || !Array.isArray(value.evidence)) throw new Error('Not a CIVIC run file (civic.run/0).')
  return value.evidence
}
