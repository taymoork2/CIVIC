import { forecastLabel, forecastOverride, indexGraph, type ContractConflict, type Evidence, type Forecast, type Override, type Owner, type SemanticComponent } from '../../graph/src/index.ts'
import { compareLibraryDefaults } from './compare.ts'
import { readFigmaLibraryComponent, readFigmaProductFile, readPublishedComponents, type LibraryComponentMapping, type LibraryFacts, type ProductManifest, type PublishedLibrary } from './figma-product.ts'
import { assemble, type Fragment } from './fragment.ts'

// A design library publish is a release (decision 0011, point 8), checked the way `civic
// release` checks a code library: every product file that consumes the library is read
// again against the new version. A key the library no longer publishes orphans the
// product's instances of it; a changed default changes which product settings are
// overrides, and each new one gets its forecast; and the library-default check runs again.
// The library's maintainers are asked, and each affected product's owners are told.
// Deterministic, read-only, and no model calls (D30).

/** One version of the library file: its export, as Figma's REST API returns it. */
export interface DesignLibraryVersion {
  export: unknown
}

/** A product file that consumes the library, with what else it consumes. */
export interface DesignReleaseConsumer {
  product: ProductManifest
  /** The product's file, as its manifest's `designFiles` names it. */
  file: string
  export: unknown
  /** The other libraries the file consumes, which this release doesn't change. */
  libraries?: PublishedLibrary[]
}

export interface DesignReleaseOptions {
  /** The library file, as the products' manifests name it. */
  file: string
  mapping: LibraryComponentMapping
  semantic: SemanticComponent
  /** Each code implementation, for the library-default check, as `compareLibraryDefaults` takes them. */
  platforms: Parameters<typeof compareLibraryDefaults>[2]
  /** The contract and platform records, so a new override can be forecast. */
  context: Fragment[]
  capturedAt: string
}

export interface ProductImpact {
  product: string
  title: string
  file: string
  /** Told: the product's owners, since the library moved, not them. */
  told: Owner[]
  /** Instances of a component the new version no longer publishes, by where they are placed. */
  orphaned: { evidenceId: string; title: string; finding: string }[]
  /** Overrides the new defaults make, each with its forecast per platform and framework. */
  newOverrides: { override: Override; forecasts: Forecast[] }[]
  /** Overrides the new defaults absorb: the product now matches the library. */
  goneOverrides: Override[]
}

export interface DesignRelease {
  file: string
  title: string
  before: string
  after: string
  /** The component's maintainers, asked to keep what the release breaks or decide it. */
  asked: Owner[]
  published: { removed: { key: string; name: string }[]; added: { key: string; name: string }[]; renamed: { key: string; before: string; after: string }[] }
  /** Why the mapped component can't be read from the new version, when it can't. */
  componentMissing?: string
  defaults: { property: string; before: unknown; after: unknown }[]
  /** Library-default conflicts the new version raises, and ones it clears. */
  libraryDefaults: { raised: ContractConflict[]; cleared: ContractConflict[] }
  products: ProductImpact[]
}

/** Reads every consuming product file against both versions of the library and says what changed for each. */
export function designLibraryRelease(before: DesignLibraryVersion, after: DesignLibraryVersion, consumers: DesignReleaseConsumer[], options: DesignReleaseOptions): DesignRelease {
  const { file, mapping } = options
  const was = readPublishedComponents(before.export, file)
  const now = readPublishedComponents(after.export, file)
  const removed = Object.entries(was.keys).filter(([key]) => !(key in now.keys)).map(([key, name]) => ({ key, name }))
  const added = Object.entries(now.keys).filter(([key]) => !(key in was.keys)).map(([key, name]) => ({ key, name }))
  const renamed = Object.entries(now.keys).filter(([key, name]) => key in was.keys && was.keys[key] !== name).map(([key, name]) => ({ key, before: was.keys[key]!, after: name }))

  const then = readFigmaLibraryComponent(before.export, mapping, options.capturedAt)
  let next: LibraryFacts | undefined
  let componentMissing: string | undefined
  try {
    next = readFigmaLibraryComponent(after.export, mapping, options.capturedAt)
  } catch (error) {
    componentMissing = (error as Error).message
  }

  const defaults = next ? Object.keys({ ...then.defaults, ...next.defaults }).filter((property) => then.defaults[property] !== next!.defaults[property]).map((property) => ({ property, before: then.defaults[property], after: next!.defaults[property] })) : []
  const conflictsOf = (facts: LibraryFacts | undefined) => (facts ? compareLibraryDefaults(options.semantic, facts, options.platforms) : [])
  const thenConflicts = conflictsOf(then)
  const nextConflicts = conflictsOf(next)
  const libraryDefaults = {
    raised: nextConflicts.filter((conflict) => !thenConflicts.some((other) => other.id === conflict.id)),
    cleared: thenConflicts.filter((conflict) => !nextConflicts.some((other) => other.id === conflict.id)),
  }

  const products = consumers
    .filter((consumer) => consumer.product.designFiles?.find((entry) => entry.file === consumer.file)?.consumes?.includes(file))
    .map((consumer): ProductImpact => {
      const read = (facts: LibraryFacts) => readFigmaProductFile(consumer.export, facts, consumer.product, options.capturedAt, { file: consumer.file, libraries: consumer.libraries ?? [] })
      const old = read(then)
      // Without the mapped component, the product file is read against the old one: its instances are orphans, reported below.
      const current = read(next ?? { ...then, published: now })
      const unknown = (fragment: Fragment) => fragment.records.filter((record): record is Evidence => record.kind === 'evidence' && record.outcome === 'fail' && record.id.includes('.unknown-component.'))
      const known = new Set(unknown(old).map((record) => record.id))
      const orphaned = unknown(current)
        .filter((record) => !known.has(record.id))
        .map((record) => {
          // Name the removed component when the finding is about one, rather than "no consumed library".
          const gone = removed.find((entry) => record.finding?.includes(entry.key))
          const title = gone ? `${record.title.replace(/ comes from no consumed library$/, '')} is an instance of ${gone.name}, which the new version no longer publishes` : record.title
          return { evidenceId: record.id, title, finding: record.finding ?? '' }
        })
      if (componentMissing) {
        for (const instance of old.records.filter((record) => record.kind === 'component-instance' && !record.fork)) {
          orphaned.push({ evidenceId: instance.id, title: `${instance.title} is an instance of ${mapping.componentSet}`, finding: componentMissing })
        }
      }
      const overridesOf = (fragment: Fragment) => new Map(fragment.records.filter((record): record is Override => record.kind === 'override').map((override) => [override.id, override]))
      const oldOverrides = overridesOf(old)
      const newOverrides = overridesOf(current)
      const changed = (override: Override) => {
        const previous = oldOverrides.get(override.id)
        return !previous || previous.value !== override.value || previous.property !== override.property
      }
      const graph = indexGraph(assemble(...options.context, current))
      return {
        product: consumer.product.product,
        title: consumer.product.title,
        file: consumer.file,
        told: consumer.product.owners,
        orphaned,
        newOverrides: componentMissing ? [] : [...newOverrides.values()].filter(changed).map((override) => ({ override, forecasts: forecastOverride(graph, override.id) })),
        goneOverrides: componentMissing ? [] : [...oldOverrides.values()].filter((override) => !newOverrides.has(override.id)),
      }
    })

  return {
    file,
    title: now.title,
    before: was.revision,
    after: now.revision,
    asked: mapping.owners ?? [],
    published: { removed, added, renamed },
    ...(componentMissing ? { componentMissing } : {}),
    defaults,
    libraryDefaults,
    products,
  }
}

/** Whether the release breaks a product: an orphaned instance, a new override, or a default a platform can't build. */
export function designReleaseBreaks(release: DesignRelease): boolean {
  return Boolean(release.componentMissing) || release.libraryDefaults.raised.length > 0 || release.products.some((product) => product.orphaned.length > 0 || product.newOverrides.length > 0)
}

/** The release as Markdown: what the library changed, then each affected product. */
export function renderDesignRelease(release: DesignRelease): string {
  const people = (owners: Owner[]) => (owners.length > 0 ? owners.map((owner) => `${owner.who} (${owner.role})`).join(', ') : 'no owner recorded')
  const value = (input: unknown) => (input === undefined ? 'nothing' : String(input))
  const lines = [`# Design library release: ${release.title}`, '', `\`${release.file}\` from version ${release.before} to ${release.after}. Asked: ${people(release.asked)}.`, '']
  const { removed, added, renamed } = release.published
  lines.push('## What the library publishes', '')
  if (removed.length + added.length + renamed.length === 0) lines.push('The same components, under the same keys and names.')
  for (const entry of removed) lines.push(`- Removed: ${entry.name} (key ${entry.key}).`)
  for (const entry of added) lines.push(`- Added: ${entry.name} (key ${entry.key}).`)
  for (const entry of renamed) lines.push(`- Renamed: ${entry.before} to ${entry.after} (key ${entry.key}); products keep their instances, because they match by key.`)
  lines.push('')
  if (release.componentMissing) lines.push(`The mapped component can't be read from the new version: ${release.componentMissing}`, '')
  if (release.defaults.length > 0) {
    lines.push('## Defaults that changed', '')
    for (const entry of release.defaults) lines.push(`- ${entry.property}: ${value(entry.before)} before, ${value(entry.after)} now.`)
    lines.push('')
  }
  if (release.libraryDefaults.raised.length + release.libraryDefaults.cleared.length > 0) {
    lines.push('## The library-default check, run again', '')
    for (const conflict of release.libraryDefaults.raised) lines.push(`- Raised: ${conflict.title}. ${conflict.summary}`)
    for (const conflict of release.libraryDefaults.cleared) lines.push(`- Cleared: ${conflict.title}; the library no longer shows it by default.`)
    lines.push('')
  }
  for (const product of release.products) {
    lines.push(`## ${product.title}: ${product.file}`, '', `Told: ${people(product.told)}.`, '')
    if (product.orphaned.length + product.newOverrides.length + product.goneOverrides.length === 0) lines.push('Nothing changes for this product.', '')
    if (product.orphaned.length > 0) {
      lines.push('Orphaned by the release:', '')
      for (const orphan of product.orphaned) lines.push(`- ${orphan.title}.`)
      lines.push('')
    }
    if (product.newOverrides.length > 0) {
      lines.push('New overrides, because the library default moved and the product kept its setting:', '')
      for (const { override, forecasts } of product.newOverrides) {
        lines.push(`- ${override.title} on ${override.instanceId}: ${forecasts.map((forecast) => `${forecastLabel(forecast)} ${forecast.outcome}`).join(', ')}.`)
      }
      lines.push('')
    }
    if (product.goneOverrides.length > 0) {
      lines.push('Overrides the release absorbs, because the product now matches the library:', '')
      for (const override of product.goneOverrides) lines.push(`- ${override.title} on ${override.instanceId}.`)
      lines.push('')
    }
  }
  return lines.join('\n').trimEnd()
}
