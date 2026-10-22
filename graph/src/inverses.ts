// "Can you go back?" (decision 0015). Every action that creates or starts something needs a
// way to undo it, and a product that ships only the forward half leaves people stuck with
// what they made. Actions are matched by their kind (`add`, `remove`, `archive`), which an
// object's action declares, so the check works in any language; a label's words are read
// into a kind only when none is declared. Deterministic, no model calls (D30).

/** The kinds that need an inverse, each with the kinds that count as one. */
export const DEFAULT_INVERSES: Readonly<Record<string, readonly string[]>> = {
  add: ['remove', 'archive'],
  archive: ['restore'],
  send: ['cancel', 'edit'],
  queue: ['cancel', 'edit'],
  start: ['stop'],
  pin: ['unpin'],
  open: ['close'],
  connect: ['disconnect'],
  install: ['uninstall'],
  'sign-in': ['sign-out'],
  enable: ['disable'],
}

/** Words in a label, and the kind each one stands for, when the action declares none. */
export const DEFAULT_LABELS: Readonly<Record<string, string>> = {
  add: 'add', create: 'add', new: 'add',
  remove: 'remove', delete: 'remove', destroy: 'remove', erase: 'remove',
  archive: 'archive', restore: 'restore', unarchive: 'restore', reopen: 'restore',
  send: 'send', queue: 'queue', cancel: 'cancel', unsend: 'cancel', dequeue: 'cancel', edit: 'edit',
  start: 'start', stop: 'stop', pin: 'pin', unpin: 'unpin', open: 'open', close: 'close',
  connect: 'connect', disconnect: 'disconnect', install: 'install', uninstall: 'uninstall',
  'sign in': 'sign-in', 'log in': 'sign-in', login: 'sign-in', 'sign out': 'sign-out', 'log out': 'sign-out', logout: 'sign-out',
  enable: 'enable', disable: 'disable',
}

/** A project's own vocabulary, from `actions` in `civic.check.json`. It extends the defaults. */
export interface ActionVocabulary {
  /** Kinds that need an inverse, by kind. A project's entry replaces the default for that kind. */
  inverses?: Record<string, string[]>
  /** Label words (any language) and the kind each stands for. */
  labels?: Record<string, string>
}

export interface ResolvedVocabulary {
  inverses: ReadonlyMap<string, readonly string[]>
  /** Longest phrases first, so `sign out` is read before `out`. */
  labels: readonly (readonly [string, string])[]
}

export function resolveVocabulary(custom: ActionVocabulary = {}): ResolvedVocabulary {
  const labels = { ...DEFAULT_LABELS, ...Object.fromEntries(Object.entries(custom.labels ?? {}).map(([word, kind]) => [word.toLowerCase(), kind])) }
  return {
    inverses: new Map(Object.entries({ ...DEFAULT_INVERSES, ...custom.inverses })),
    labels: Object.entries(labels).sort(([a], [b]) => b.length - a.length || a.localeCompare(b)),
  }
}

const words = (text: string) => ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `

/** The kind a label stands for: the first label word or phrase it contains as whole words. */
export function kindOfLabel(label: string, vocabulary: ResolvedVocabulary): string | undefined {
  const text = words(label)
  const found = vocabulary.labels.filter(([word]) => text.includes(words(word)))
  // The earliest match in the label wins ("Remove project" is a remove, not a project action).
  return found.sort(([a], [b]) => text.indexOf(words(a)) - text.indexOf(words(b)))[0]?.[1]
}

/** Checks a project's vocabulary: every kind named is a non-empty string, and an inverse list is not empty. */
export function vocabularyErrors(custom: ActionVocabulary): string[] {
  const errors: string[] = []
  for (const [kind, undo] of Object.entries(custom.inverses ?? {})) {
    if (!Array.isArray(undo) || undo.length === 0 || undo.some((item) => typeof item !== 'string' || item === '')) errors.push(`actions.inverses.${kind} lists the kinds that undo it.`)
  }
  for (const [word, kind] of Object.entries(custom.labels ?? {})) {
    if (typeof kind !== 'string' || kind === '' || word.trim() === '') errors.push(`actions.labels.${word} names the kind it stands for.`)
  }
  return errors
}
