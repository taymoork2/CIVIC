import type { ComponentStory, ExtensionPoint, PlatformComponent, SemanticComponent } from '../../graph/src/index.ts'
import { slug } from './fragment.ts'
import { jsImports, jsxElements } from './react-code.ts'

// The one-time Storybook import (decision 0013, point 1): a team moving off Storybook brings
// its stories in once. Each element a story export renders becomes a component story with the
// props it sets literally: the variant property maps to a semantic variant through the
// implementation's declared mapping, `disabled` is the disabled state, and every other prop is
// kept by the extension point that declares it. A prop no extension point declares, such as
// `className`, is listed on the story, since it styles the component around its contract.
// Stories that pass their args through (`{...props}`) show the component's default. CIVIC's
// component stories then prune what the contract already shows. Static analysis of the story
// source, so a prop set to an element or an expression is kept as set, with no value. No model calls.

export interface StorybookImportOptions {
  component: PlatformComponent
  semantic: SemanticComponent
  extensionPoints: readonly ExtensionPoint[]
  /** The prop that picks the variant, such as `appearance`, as the mapping declares it. */
  variantProperty: string
  /** Packages the stories import the component from: its own and any that re-export it. */
  packages: readonly string[]
  /** Where the stories were read, for each reference: a folder and its upstream revision. */
  path: string
}

export interface StorybookImport {
  title: string
  stories: ComponentStory[]
  /** Elements that couldn't become a story, and why. */
  skipped: { story: string; file: string; line: number; why: string }[]
}

export function readStorybookStories(files: readonly { name: string; text: string }[], options: StorybookImportOptions): StorybookImport {
  const { component, semantic } = options
  const title = files.map((file) => /export\s+default\s*\{[^}]*?title:\s*['"]([^'"]+)['"]/s.exec(file.text)?.[1]).find(Boolean) ?? component.symbol
  const stories: ComponentStory[] = []
  const skipped: StorybookImport['skipped'] = []
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const local = jsImports(file.text).find((entry) => options.packages.includes(entry.from) && entry.symbol === component.symbol)?.local
    if (!local) continue
    const exports = [...file.text.matchAll(/export\s+const\s+([A-Z]\w*)\s*=/g)].map((match) => ({ name: match[1]!, start: match.index! }))
    exports.forEach((story, position) => {
      const end = exports[position + 1]?.start ?? file.text.length
      const body = file.text.slice(story.start, end)
      const spreads = new RegExp(`<${local}\\s*\\{\\s*\\.\\.\\.`).test(body)
      for (const element of jsxElements(body, local)) {
        const line = file.text.slice(0, story.start + element.start).split('\n').length
        const label = element.inner.replace(/<[^>]*>/g, ' ').replace(/[{}]/g, ' ').replace(/\s+/g, ' ').trim() || (typeof element.props.get('aria-label') === 'string' ? String(element.props.get('aria-label')) : 'no text')
        const chosen = element.props.get(options.variantProperty)
        const mapping = chosen === undefined ? component.variants.find((item) => item.semanticVariant === component.defaultVariant) : component.variants.find((item) => item.expression === chosen)
        if (!mapping || mapping.mapping === 'none' || !mapping.expression) {
          skipped.push({ story: story.name, file: `${options.path}/${file.name}`, line, why: chosen === undefined ? `${component.symbol} declares no default variant` : typeof chosen === 'string' ? `${options.variantProperty}="${chosen}" maps to no semantic variant` : `${options.variantProperty} is computed at runtime` })
          continue
        }
        const disabled = element.props.get('disabled')
        const state = disabled === true ? 'disabled' : undefined
        const props: Record<string, string | number | boolean | null> = {}
        const undeclared: string[] = []
        for (const [name, value] of element.props) {
          if (name === options.variantProperty || name === 'disabled' || name === 'key') continue
          if (options.extensionPoints.some((point) => point.platformComponentId === component.id && point.name === name)) props[name] = value ?? null
          else undeclared.push(name)
        }
        const keyed = Object.entries(props).sort(([a], [b]) => a.localeCompare(b))
        stories.push({
          id: `story:component.${component.id.replace(/^platform:/, '')}.${mapping.semanticVariant}${state ? `.${state}` : ''}${keyed.map(([name, value]) => `.${slug(`${name}-${value === null ? 'set' : String(value)}`)}`).join('')}`,
          kind: 'component',
          title: `${semantic.variants.find((variant) => variant.key === mapping.semanticVariant)?.title ?? mapping.semanticVariant}${state ? `, ${state}` : ''}${keyed.map(([name, value]) => `, ${name} ${value === null ? '(set in code)' : String(value)}`).join('')}`,
          semanticId: semantic.id,
          componentId: component.id,
          platform: component.platform,
          ...(component.framework ? { framework: component.framework } : {}),
          variant: mapping.semanticVariant,
          expression: mapping.expression,
          mapping: mapping.mapping,
          ...(mapping.note ? { note: mapping.note } : {}),
          ...(state ? { state } : {}),
          from: 'storybook',
          instanceIds: [],
          ...(keyed.length > 0 ? { props: Object.fromEntries(keyed) } : {}),
          storybook: [{ title, story: story.name, file: `${options.path}/${file.name}`, line, label: spreads && element.props.size === 0 ? `${label} (its args)` : label, ...(undeclared.length > 0 ? { undeclared: undeclared.sort() } : {}) }],
        })
      }
    })
  }
  return { title, stories, skipped }
}

/** The import as a migration report: what each Storybook story became. */
export function renderStorybookImport(result: StorybookImport, kept: readonly ComponentStory[]): string {
  const refs = kept.flatMap((story) => (story.storybook ?? []).map((ref) => ({ ref, story })))
  const lines = [`# Storybook import: ${result.title}`, '', `${refs.length} element(s) read from ${new Set(refs.map(({ ref }) => ref.story)).size} Storybook stories; ${result.skipped.length} skipped. Each now stands for a CIVIC component story (decision 0013).`, '']
  const byStory = new Map<string, typeof refs>()
  for (const entry of refs) byStory.set(entry.ref.story, [...(byStory.get(entry.ref.story) ?? []), entry])
  for (const [story, entries] of [...byStory].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${story}`, '')
    for (const { ref, story: into } of entries.sort((a, b) => a.ref.line - b.ref.line)) {
      const fate = into.from === 'storybook' ? `kept as \`${into.id}\`` : `pruned: the ${into.from === 'contract' ? 'contract' : 'usage'} story \`${into.id}\` shows it`
      lines.push(`- L${ref.line} “${ref.label}”: ${fate}.${ref.undeclared ? ` Also sets ${ref.undeclared.map((name) => `\`${name}\``).join(', ')}, which no extension point declares.` : ''}`)
    }
    lines.push('')
  }
  if (result.skipped.length > 0) {
    lines.push('## Skipped', '')
    for (const item of result.skipped) lines.push(`- ${item.story}, ${item.file} L${item.line}: ${item.why}.`)
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
