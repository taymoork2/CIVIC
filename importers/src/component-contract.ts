import type { Evidence, Link, Owner, PlatformComponent, SemanticComponent, SourceRef } from '../../graph/src/index.ts'

export interface ComponentFamilyOptions {
  /** The ID segment for this product, as in `semantic:<prefix>.<family>`. */
  prefix: string
  owners: Owner[]
  /** Where the contract was read, with its revision and content hash. */
  source: SourceRef
}

/**
 * Reads a design system's component contract written as Markdown: the table under a
 * "Component families" heading, one row per family, with the family's stable name in
 * backticks, its anatomy and sizing, and its required states and behavior. Each family is a
 * Semantic component whose purpose is its anatomy; its states and behavior are one contract
 * rule, kept in the contract's own words, because they are prose rather than a state list.
 */
export function readComponentFamilies(markdown: string, options: ComponentFamilyOptions): SemanticComponent[] {
  const rows = tableAfter(markdown, /^#+\s+Component families\s*$/m)
  if (rows.length === 0) throw new Error('The contract has no "Component families" table.')
  return rows.map(([name, anatomy, behavior]) => {
    const family = /^`([a-z][a-z0-9-]*)`$/.exec(name ?? '')?.[1]
    if (!family || !anatomy || !behavior) throw new Error(`A component family row needs a backticked name, its anatomy and its behavior: ${name}`)
    return {
      id: `semantic:${options.prefix}.${family}`,
      kind: 'semantic-component',
      title: family,
      purpose: anatomy,
      variants: [],
      states: [],
      rules: [{ key: 'states-and-behavior', statement: behavior }],
      owners: options.owners,
      source: { ...options.source, anchor: family },
    }
  })
}

export interface WebComponentOptions {
  prefix: string
  /** The package the components ship in, such as the app's own package name. */
  package: string
  owners: Owner[]
  /** The commit the sources were read at. */
  revision: string
  evidenceId: string
  capturedAt: string
}

/**
 * Looks for each family's web component by name: an exported React component whose name is
 * the family's in PascalCase (`answer-row` is `AnswerRow`). A match is a Platform component
 * with an inferred `implements` link, because a shared name is a guess until someone confirms
 * it. A family with no such export is listed, not raised: it may be built under another name
 * or as plain markup. Deterministic, with no model calls.
 */
export function findWebComponents(
  families: readonly SemanticComponent[],
  sources: readonly { path: string; text: string }[],
  options: WebComponentOptions,
): { components: PlatformComponent[]; links: Link[]; evidence: Evidence; missing: string[] } {
  const components: PlatformComponent[] = []
  const links: Link[] = []
  const missing: string[] = []
  for (const family of families) {
    const symbol = family.title.replace(/(^|-)([a-z0-9])/g, (_, __, letter: string) => letter.toUpperCase())
    const declaration = new RegExp(`export\\s+(?:default\\s+)?(?:function\\s+${symbol}\\s*[(<]|const\\s+${symbol}\\s*[=:])`)
    const found = sources.find((file) => declaration.test(file.text))
    if (!found) {
      missing.push(family.title)
      continue
    }
    const line = found.text.slice(0, found.text.search(declaration)).split('\n').length
    const id = `platform:${options.prefix}.web.${family.title}`
    components.push({
      id,
      kind: 'platform-component',
      title: `${symbol} (web)`,
      platform: 'web',
      library: { package: options.package },
      symbol,
      variants: [],
      owners: options.owners,
      source: { tool: 'git', importer: 'component-contract', revision: options.revision, path: found.path, anchor: `L${line}` },
    })
    links.push({ from: id, relation: 'implements', to: family.id, status: 'inferred', evidenceIds: [options.evidenceId] })
  }
  const evidence: Evidence = {
    id: options.evidenceId,
    kind: 'evidence',
    title: 'Web components named after the contract families',
    subjectIds: components.map((component) => component.id),
    tier: 'static-analysis',
    method: 'source-analysis',
    platform: 'web',
    outcome: 'finding',
    finding: `${components.length} of ${families.length} families have an exported web component of the same name, in ${sources.length} source files.`,
    capturedAt: options.capturedAt,
    source: { tool: 'git', importer: 'component-contract', revision: options.revision },
  }
  return { components, links, evidence, missing }
}

/** The rows of the first Markdown table after a heading, without its header and rule rows. */
function tableAfter(markdown: string, heading: RegExp): string[][] {
  const start = markdown.search(heading)
  if (start < 0) return []
  const lines = markdown.slice(start).split('\n').slice(1)
  const first = lines.findIndex((line) => line.trim().startsWith('|'))
  if (first < 0) return []
  const rows: string[][] = []
  for (const line of lines.slice(first)) {
    if (!line.trim().startsWith('|')) break
    rows.push(line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim()))
  }
  return rows.slice(2)
}
