/** Words for Home's states, the add-garment steps and the garment record. */

import { countWord } from './shared'

export const homeHeroText = {
  title: { first: 'Welcome', today: 'Today' },
  mark: { first: 'First step', calm: 'Nothing waiting' },
  first: {
    kicker: 'A good first task',
    title: 'Start with one thing you wore this week',
    detail: 'Its care label guides your first wash plan.',
    primary: 'Add your first garment',
    art: 'A basket of laundry beside a washing machine',
  },
  setup: {
    title: 'Household setup',
    todo: 'To do',
    where: 'Where you wash',
    appliances: 'appliances',
    products: 'products',
  },
  one: {
    kicker: 'Your closet is started',
    checkLabelTitle: (name: string) => `Check the care label on ${name}`,
    checkLabelDetail: 'Confirm the missing label answers before planning a wash.',
    checkLabel: 'Check the care label',
  },
  planned: {
    kicker: 'Next for your laundry',
    readyTitle: 'Ready for the laundry room',
    readyDetail: (loads: number) => `${countWord(loads, 'load')} planned. Pick machines when you get there.`,
    readyButton: 'Open wash plan',
    blockedTitle: (load: string) => `${load} needs something first`,
    blockedDetail: 'Resolve the missing details before starting this load.',
    blockedButton: (load: string) => `Review ${load.charAt(0).toLowerCase()}${load.slice(1)}`,
  },
  running: {
    kickerOne: 'Active load',
    kickerMany: 'Running now',
    many: (count: number) => `${count} loads running`,
    left: (duration: string) => `${duration} left`,
    open: (machine: string) => `Open ${machine}`,
    checkLater: 'Check later',
    done: 'Done',
    other: 'Also running',
  },
  needsYou: 'Needs you now',
  hamper: { kicker: 'Next for your laundry', title: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'} in the hamper`, primary: 'Sort into loads' },
  drying: { kicker: 'Hanging to dry' },
  calm: {
    kicker: 'Next for your laundry',
    title: 'Nothing is waiting to wash',
    detail: 'Add worn clothes to the hamper from Closet.',
    button: 'Open Closet',
  },
  links: { closet: 'Closet', add: 'Add clothes', plan: 'Plan a wash', label: 'Quick links' },
  overview: {
    title: 'Care overview',
    pieces: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'}`,
    ready: 'Ready',
    hamper: 'Hamper',
    washing: 'Washing',
    drying: 'Drying',
    labelFlag: 'Check care labels',
  },
} as const

/** A load whose plan is blocked is reviewed, never started. */
export const dockBlockedText = {
  reviewLoad: (number: number) => `Review load ${number}`,
  reviewNamed: (name: string) => `Review the ${name}`,
} as const

/** The add-clothes steps, one question each. */
const intakeSteps = {
  type: { title: 'What is it?', to: 'Next: type' },
  whose: { title: 'Whose is it?', to: 'Next: whose' },
  details: { title: 'Item details', to: 'Next: details' },
  fabric: { title: 'What\u2019s it made of?', to: 'Next: fabric' },
  color: { title: 'Color', to: 'Next: color' },
  origin: { title: 'Where is it from?', to: 'Next: where from' },
  dye: { title: 'Could the dye run?', to: 'Next: dye' },
  care: { title: 'Care label', to: 'Next: care label' },
  label: { title: 'More on the label', to: 'Next: more on the label' },
  stain: { title: 'Any stains?', to: 'Next: stains' },
  final: { title: 'Review item', to: 'Next: review' },
} as const

export const addGarmentText = {
  /** One question to a screen; `to` names the button leading into the step. */
  steps: intakeSteps,
  /** Shown under Name: a name left blank is made from the color and type (or the picked article) at save. */
  nameHint: (example: string) => `Leave blank for a name like “${example}”.`,
  otherNameHint: 'Type what it is.',
  colorNamePlaceholder: 'e.g. Indigo, Rust, Blush',
  shade: 'How light or dark?',
  shadeUnknown: 'Not sure',
  dyeRunTitle: 'Could the dye run?',
  mixedShade: 'Mostly light or mostly dark?',
  mixedShades: { light: 'Mostly light', dark: 'Mostly dark', unknown: 'Not sure' },
  dyeRuns: { new: 'New, not washed yet', bleeds: 'Dye has run before', fast: 'Washed without dye running', unknown: 'Not sure' },
  /** Thrift and hand-me-downs: the one origin choice, an optional smell, and the first-wash facts. */
  preOwned: {
    title: 'Where is it from?',
    choice: 'Pre-owned (thrift, hand-me-down)',
    dyeNote: 'Wash with like colors and check the rinse water. Dye stays Not sure until then.',
    smellTitle: 'Smells of…',
    smells: { musty: 'Musty', smoke: 'Smoke', perfume: 'Perfume' },
    conditionTitle: 'Condition',
    fragile: 'Thin or damaged',
    fragileHint: 'Hand wash or a cleaner, never the machine.',
    heatTitle: 'Worried about bugs or lice?',
    heatChoice: 'Heat-treat first',
    pestTreatment: 'Pest treatment (optional)',
    heatHint: 'The dryer on high for 20 to 30 minutes before the wash. Washing alone does not kill bed bugs.',
    noHeat: 'This label does not allow high-heat pest treatment.',
  },
  countLabel: 'Quantity',
  /** Edit's disclosure over the same type tiles as intake: "Clothing type · T-shirt". */
  clothingType: 'Item type',
  careReview: 'Review care label',
  fabricTitle: 'What’s it made of?',
  fabricHint: 'Select all fibers on the label. Optional.',
  fabrics: { cotton: 'Cotton', polyester: 'Polyester', wool: 'Wool', silk: 'Silk', linen: 'Linen', nylon: 'Nylon', rayon: 'Rayon', elastane: 'Elastane / spandex', modal: 'Modal', other: 'Other' },
  stainTitle: 'Any stains?',
  stainLead: 'A new stain needs treating before the garment is washed.',
  stains: { none: 'No stains', food: 'Food or drink', grease: 'Grease or oil', ink: 'Ink', other: 'Something else' },
  stainAgeTitle: 'Is it new, or old and set in?',
  stainAges: { new: 'New', set_in: 'Old, set in' },
  knownMarkHint: 'May not come out. Saved as a known mark; washing can continue.',
  knownMarkSummary: 'With a known mark. It won’t hold up washing.',
  stainDestination: 'Will go to the hamper.',
  stainDryCleanDestination: 'Needs dry cleaning.',
  save: 'Save item',
  saveTo: 'Clothes are',
  destinations: { closet: 'Ready to wear', hamper: 'Needs washing' },
  careNext: 'Next',
  moreOnLabel: 'More on the label',
  /** The save step's last line: what will be saved, and where. */
  summaryLabel: 'Saving',
  summary: (name: string, count: number, place: string) => `${name}${count === 1 ? '' : ` \u00b7 ${count} pieces`} \u00b7 ${place}`,
  moreDetails: 'Manufacturer reference (optional)',
  /** The saved panel: what landed and where, then add another, the same in another color, or Done. */
  savedTitle: 'Saved',
  firstSavedTitle: (count: number) => count === 1 ? 'First item added' : 'First items added',
  landed: (words: string, place: string) => `${words} added to ${place}`,
  landedPlaces: { closet: 'Ready to wear', hamper: 'the hamper' },
  tally: (count: number) => `${count} added`,
  addAnother: 'Add something else',
  addMore: 'Add more',
  sameAgain: 'Another color',
  sameAgainHint: 'Keeps the type and care label',
  done: 'Done',
  carriedCare: 'Care label copied. Check it on the next step.',
  /** Done after more than one save: one toast for everything added. */
  tallyToast: (closet: number, hamper: number) => [
    closet === 0 ? '' : `${countWord(closet, 'item')} saved as ready to wear.`,
    hamper === 0 ? '' : `${countWord(hamper, 'laundry item')} ${hamper === 1 ? 'is' : 'are'} waiting to wash in Laundry.`,
  ].filter(Boolean).join(' '),
} as const

/** The type step's search over specific clothing articles, above the type tiles. */
export const garmentSearchText = {
  label: 'Search items',
  placeholder: 'e.g. hoodie, towel or sheets',
  /** A result's accessible name: "Hoodie, Sweater". */
  result: (article: string, type: string) => `${article}, ${type}`,
  matches: (count: number) => (count === 0 ? 'No matches' : `${count} ${count === 1 ? 'match' : 'matches'}`),
  asOther: (typed: string) => `Add \u201c${typed}\u201d as Other`,
} as const

export const garmentRecordCaveats = {
  photo: 'Example artwork. Care follows your recorded label.',
  tagsSave: 'Save tags',
  tagsSaved: 'Tags saved.',
} as const

/** The Closet list: grouping, filters, marks and the words around the rows. */
export const closetListText = {
  searchPlaceholder: 'Search name, color, tag or person',
  groupLabel: 'Group clothes by',
  filterLabel: 'Filter clothes',
  groups: { type: 'Type', owner: 'Person', status: 'Status' },
  status: { label: 'Needs a care label', laundry: 'In the laundry', hamper: 'In the hamper', refresh: 'Needs a refresh', cleaner: 'Dry cleaning', ready: 'Ready' },
  marks: { ready: 'Ready', dirty: 'In the hamper', in_wash: 'Washing', hanging: 'Drying', needs_dry_clean: 'Needs dry cleaning', at_cleaner: 'At the cleaner', needs_refresh: 'Needs a refresh' },
  /** The glance at the top: where the clothes stand, and whose closet this is. */
  glance: { label: 'Your clothes at a glance', ready: 'Ready', laundry: 'In the laundry', hamper: 'In the hamper', care: 'Needs care', people: 'Whose clothes' },
  markNeedsLabel: 'Needs label',
  everyone: 'Shared',
  pieces: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'}`,
  nothingMatches: (query: string) => `Nothing matches “${query}”.`,
  none: 'No clothes yet.',
} as const

/** The garment record's care label: three symbols, and one question at a time to change them. */
export type CareQuestion = 'wash' | 'bleach' | 'dry'

export const careQuestionText = {
  rowLabel: 'Care label',
  notChecked: 'Not checked',
  notOnTag: 'Tag doesn’t say',
  wash: { cell: 'Washing', title: 'How does it wash?', lead: 'Find the tub on the label. The number is the highest temperature.' },
  bleach: { cell: 'Bleach', title: 'Can it be bleached?', lead: 'Find the triangle.' },
  dry: { cell: 'Drying', title: 'How does it dry?', lead: 'Match the drying symbol on the label, including line or flat drying.' },
  naturalLabel: 'How it dries instead',
  save: 'Save',
  saved: 'Care label saved.',
} as const

/** The garment record's tabs and facts. */
export const garmentTabText = {
  tabs: 'Garment record',
  care: 'Care',
  details: 'Details',
  history: 'History',
  stain: 'Stain',
  /** An old, set-in stain saved at intake: it never holds up washing. */
  knownMark: 'Known mark',
  knownMarkWords: (mark: { readonly reason: string; readonly kind: string }) =>
    mark.reason === 'food' ? 'Old food stain' : mark.kind === 'oil_grease' ? 'Old grease or oil stain' : mark.kind === 'dye_ink_transfer' ? 'Old ink stain' : 'Old stain',
  knownMarkOn: (marked: number, total: number) => `on ${marked} of ${total}`,
  treatMark: 'Try treating it at the next wash',
  treatMarkHint: 'Old stains may not come out, even after treating.',
  removeMark: 'Remove mark',
  markTreating: (count: number) => `${count === 1 ? 'It’s' : `${count} items are`} in the hamper to try treating. It may not come out.`,
  markToDryClean: 'It’s on the dry cleaning list. It may not come out.',
  markRemoved: 'Mark removed.',
  fabric: 'Fabric',
  fabricNotRecorded: 'Not recorded',
  /** A washed stain: "Stain gone?", and what to do when it stayed. */
  stainCheck: 'Stain check',
  stainWords: (stain: { readonly reason: string; readonly kind: string }) =>
    stain.reason === 'food' ? 'Food stain' : stain.kind === 'oil_grease' ? 'Grease or oil stain' : stain.kind === 'dye_ink_transfer' ? 'Ink stain' : 'Stain',
  stainStatus: (answer: 'lighter' | 'still_there' | 'worse' | undefined, washes: number) =>
    `${answer === 'lighter' ? 'lighter' : answer === 'still_there' ? 'still there' : answer === 'worse' ? 'worse' : 'not checked yet'} after ${washes === 1 ? '1 wash' : `${washes} washes`}`,
  stainTried: 'Pretreated with',
  stainGone: 'Stain gone?',
  /** The question on matching pieces names how many it covers: "Stain gone on 2 of 3?". */
  stainGoneOn: (on: string | null) => on === null ? 'Stain gone?' : `Stain gone ${on}?`,
  stainAnswers: { gone: 'Gone', lighter: 'Lighter', still_there: 'Still there' },
  stainNext: 'What next?',
  stainTryAgain: 'Try once more',
  stainCleaner: 'Take it to a cleaner',
  stainKeep: 'Keep as a known mark',
  stainRetire: 'Retire it',
  stainCleanerFirst: 'Silk, wool, rayon and dry-clean-only pieces are safest with a cleaner. The note says the stain and what was tried.',
  stainWorse: 'It got worse after washing, so a cleaner is the safest next step. The note says the stain and what was tried.',
  stainValuable: 'For a valuable piece, a cleaner is safest.',
  stainFabricNeeded: 'Record every fiber to see whether one more try at home is safe.',
  stainNotes: {
    gone: 'Stain gone. It can use the dryer again as its label allows.',
    answered: 'Noted. Keep it out of the dryer; once it’s dry, choose what to do next here.',
    retry: 'In the hamper for one more try with something different.',
    cleaner: 'On the cleaner list, with the stain and what was tried.',
    kept: 'Kept as a known mark.',
    retired: 'Retired.',
  },
  sort: 'Sorts into',
  recent: 'Recent care',
  drying: 'Drying preference',
  type: 'Type',
  whose: 'Whose',
  color: 'Color',
  dye: 'Dye',
  differentDyeRuns: 'Different observations',
  preOwned: 'Pre-owned',
  preOwnedSmell: (smell: string) => `smells ${smell.toLowerCase()}`,
  quantity: 'Quantity',
  brand: 'Brand',
  tags: 'Tags',
  noTags: 'None',
  status: 'Status',
  notSet: 'Not set',
  more: 'More',
  addToHamper: (count: number) => `Add to hamper · ${count} ready`,
  checkLabel: 'Check care label',
  labelTitle: 'Care label not checked',
  labelDetail: 'Confirm washing and drying before your first wash.',
} as const
export const garmentPrivacyText = {
  title: 'Private',
  tip: "Others in your household won't see it; care still applies",
}
