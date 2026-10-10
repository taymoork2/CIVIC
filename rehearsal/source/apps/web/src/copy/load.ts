/**
 * The words of the Laundry tab's planned loads and of the load review (design `laundryScreen` and
 * `loadScreen`). Wording only; the shared words of the review (headings, started banner) stay in
 * `copy-laundry.ts`.
 */

export const hamperLoadsText = {
  /** The row's mark for a load that cannot be washed yet; the count is the load review's to give. */
  toResolve: 'To resolve',
  /** The footer's primary: "Open lights load". */
  openLoad: (name: string) => `Open ${name.toLowerCase()} load`,
} as const

export const loadReviewText = {
  /** "Lights load", the screen's title. */
  title: (name: string) => `${name} load`,
  back: 'Back to Laundry',
  leftOut: 'Left out of this load',
  putBack: 'Put back',
  putBackAria: (name: string) => `Put ${name} back in this load`,
  putClothesBack: 'Put clothes back',
  chooseDetergent: 'Choose a detergent',
  detergent: 'Detergent',
  pretreatment: 'Pretreatment',
  softenerIn: 'Softener · in this load',
  softenerOut: 'Softener · optional, not in this load',
  openSession: 'Open session',
  pickWasher: 'At the room? Pick a free washer',
  careNotRecorded: 'Care not recorded',
  requirements: (people: string) => `Product requirements in this load: ${people}. Every product stage is checked.`,
  requirementsOf: (name: string, words: string) => `${name} (${words})`,
  fragranceFree: 'fragrance-free',
  dyeFree: 'dye-free',
  avoid: (ingredient: string) => `no ${ingredient.toLowerCase()}`,
  /** The footer note while problems remain: "1 of 2 to resolve · Check the tag on Linen shirt". */
  oneOf: (count: number, issue: string | null) => `1 of ${count} to resolve${issue === null || issue === '' ? '' : ` · ${issue}`}`,
  washMachine: 'Machine wash',
  washHand: 'Hand wash',
  washDryClean: 'Dry clean only',
  washNot: 'Do not wash',
} as const

export const privatePieceText = {
  pieces: (count: number) => `${count} private ${count === 1 ? 'piece' : 'pieces'}`,
  unknown: 'Care not recorded; check the label',
  machine: 'Machine wash', hand: 'Hand wash', cleaner: 'Dry clean only', noWash: 'Do not wash',
  maximum: (temperature: number) => `up to ${temperature}°C`,
  noBleach: 'No bleach', oxygenOnly: 'Non-chlorine bleach only',
  hang: 'Hang to dry', flat: 'Lay flat', noTumble: 'Do not tumble dry', tumble: 'Tumble dry',
  drip: 'Drip dry',
  heat: { no_heat: 'No heat', delicate: 'Delicate heat', low: 'Low heat', medium: 'Medium heat', high: 'High heat' },
}
