/**
 * One detergent per load, switchable: the words of the design's "Detergent" and "Switch detergent"
 * sheets and of "Products with you" at the machines. Nothing is substituted until the person chooses.
 */

/** Why a detergent doesn't fit a load, as the planner's cause names it, in the words after the dot. */
export const detergentCauseWords: Readonly<Record<string, string>> = {
  tag_forbids_bleach: 'tag conflict',
  profile_requirement_conflict: 'excluded by a profile requirement',
  profile_requirement_unknown: 'needs a check',
  product_safety_needed: 'needs a check',
  protein_fiber_enzyme: 'not for wool or silk',
  protein_fiber_enzyme_unknown: 'needs an enzyme check',
}

export const detergentText = {
  pick: {
    kicker: (load: string) => `${load} load`,
    title: 'Detergent',
    confirm: 'Use for this load',
  },
  sub: {
    title: 'Switch detergent',
    fits: (form: string) => `${form} · fits this load`,
    excluded: 'Excluded for this load',
    changes: 'What changes',
    unavailable: 'Not available for this load. Nothing is substituted automatically.',
    confirm: 'Confirm new recipe',
    didntGoIn: 'It didn’t go in · switch',
    keep: 'Keep what’s already in',
    alreadyIn: (amount: string | null, name: string) => `${amount === null ? 'Some' : amount} of ${name} is already in. Adding another detergent would double it.`,
    none: 'No other detergent to switch to.',
    /** The session's recipe is fixed once its steps exist, so a switch plans the load again. */
    restart: 'Switching replans this load. Choose the washer and confirm the new recipe before pouring.',
    offline: 'Switching needs a connection.',
  },
  stepPill: 'Ran out? Switch product',
  /** A change card line for a step: "Detergent: Tide · 30 mL". */
  stepLine: (product: string, amount: string) => `${product} · ${amount}`,
  atMachine: 'amount chosen at the machine',
  noStep: 'Not used',
  useAnother: 'Use another detergent',
  room: {
    heading: 'Products with you',
    caption: 'Mark unavailable products as Ran out.',
    ranOut: 'Ran out',
    haveIt: 'Have it',
    planned: 'planned',
    ranOutTitle: (name: string) => `${name} ran out`,
    switchHint: 'Choose a compatible replacement. Nothing is switched automatically.',
    noneFit: 'Products in stock don’t meet this load’s requirements.',
    noneInStock: 'No other detergent in stock.',
    switchTo: (name: string) => `Switch to ${name}`,
    chooseAbove: 'Choose a detergent above',
    reviewOptions: 'Review detergent options',
  },
} as const
