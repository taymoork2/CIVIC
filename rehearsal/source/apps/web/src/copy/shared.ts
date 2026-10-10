import type { ColorGroup, DryMethod, DryerHeat, EvidenceLevel, FlagReason, GarmentKind, LoadSize, Occasion, Placement, SoilLevel, WearerKind, washerStages } from '@washcloset/planner'

import type { CareSymbolKind } from '@/closet/care-symbols'
import type { WashPlace } from '../private-state'

/**
 * The app's shared words, one place for each. Screens never print a stored value, a planner code
 * or a planner sentence: they print these. Sentence case throughout.
 */

/** How dirty, as the answer buttons read. */
export const soilButtonWords = { light: 'A little', normal: 'Normal', heavy: 'Very dirty' } as const satisfies Record<SoilLevel, string>
/** How dirty, inside a sentence: "a very dirty load". */
export const soilSentenceWords = { light: 'lightly worn', normal: 'normal', heavy: 'very dirty' } as const satisfies Record<SoilLevel, string>

/** A load size inside a sentence: "a large load". */
export const loadSizeWords = { small: 'small', medium: 'medium', large: 'large', extra_large: 'extra large' } as const satisfies Record<LoadSize, string>

/** What a product is used for, as the sheet's chips and the Household row read. */
export const bottleUseWords = {
  detergent: 'Detergent',
  booster: 'Booster',
  scent_booster: 'Scent booster',
  softener: 'Softener',
  sanitizer: 'Sanitizer',
  rinse_sanitizer: 'Rinse sanitizer',
  dryer_sheet: 'Dryer sheet',
  dryer_ball: 'Dryer balls',
} as const
/** A line under the chips once a use that is easy to mix up is picked. */
export const bottleUseHints: Readonly<Partial<Record<keyof typeof bottleUseWords, string>>> = {
  rinse_sanitizer: 'Lysol Laundry Sanitizer: goes in the rinse',
  scent_booster: 'Adds scent only. Goes in the empty drum before the clothes, never the drawer or the dryer.',
}

/** The drum pictures, emptiest first: what the person sees in the drum is the load size. */
export const drumPictures = [
  { size: 'small', word: 'A quarter', fill: 0.25 },
  { size: 'medium', word: 'Half', fill: 0.5 },
  { size: 'large', word: 'Three quarters', fill: 0.75 },
  { size: 'extra_large', word: 'Full', fill: 1 },
] as const satisfies ReadonlyArray<{ size: LoadSize; word: string; fill: number }>

/**
 * A wash temperature as a word. The tag's water dots store 30, 40, 50 and 60 °C; an older record's
 * value between them reads as the dot it does not exceed. Unknown prints nothing.
 */
export function temperatureWord(celsius: number | null | undefined): string | null {
  if (celsius === null || celsius === undefined || !Number.isFinite(celsius)) return null
  if (celsius <= 30) return 'Cold'
  if (celsius <= 40) return 'Warm'
  if (celsius <= 50) return 'Hot'
  return 'Very hot'
}

export const cycleWords: Readonly<Record<string, string>> = {
  normal: 'Normal',
  delicate: 'Delicate',
  permanent_press: 'Permanent press',
  heavy_duty: 'Heavy duty',
  quick: 'Quick',
}

/** A cycle as a word; a cycle the app has no word for prints nothing rather than a code. */
export function cycleWord(cycle: string | null | undefined): string | null {
  return cycle === null || cycle === undefined ? null : cycleWords[cycle] ?? null
}

/**
 * What each care-tag symbol says, as the tag's legend reads it. The water dots read as
 * temperatureWord does (1 cold, 2 warm, 3 hot, 4 very hot); one bar under the tub is permanent
 * press, two are delicate.
 */
export const careSymbolWords = {
  wash: 'Machine wash',
  wash_1: 'Machine wash, cold',
  wash_2: 'Machine wash, warm',
  wash_3: 'Machine wash, hot',
  wash_4: 'Machine wash, very hot',
  wash_5: 'Machine wash, very hot (160°F)',
  wash_6: 'Machine wash, very hot (200°F)',
  wash_permanent_press: 'Machine wash, permanent press',
  wash_delicate: 'Machine wash, delicate',
  wash_1_permanent_press: 'Machine wash, cold, permanent press',
  wash_1_delicate: 'Machine wash, cold, delicate',
  wash_2_permanent_press: 'Machine wash, warm, permanent press',
  wash_2_delicate: 'Machine wash, warm, delicate',
  wash_3_permanent_press: 'Machine wash, hot, permanent press',
  wash_3_delicate: 'Machine wash, hot, delicate',
  wash_4_permanent_press: 'Machine wash, very hot, permanent press',
  wash_4_delicate: 'Machine wash, very hot, delicate',
  wash_5_permanent_press: 'Machine wash, very hot (160°F), permanent press',
  wash_5_delicate: 'Machine wash, very hot (160°F), delicate',
  wash_6_permanent_press: 'Machine wash, very hot (200°F), permanent press',
  wash_6_delicate: 'Machine wash, very hot (200°F), delicate',
  hand_wash: 'Hand wash',
  do_not_wash: 'Do not wash',
  bleach: 'Any bleach',
  bleach_non_chlorine: 'Non-chlorine bleach only',
  do_not_bleach: 'Do not bleach',
  tumble_dry: 'Tumble dry',
  tumble_dry_low: 'Tumble dry, low heat',
  tumble_dry_medium: 'Tumble dry, medium heat',
  tumble_dry_high: 'Tumble dry, high heat',
  tumble_dry_no_heat: 'Tumble dry, no heat',
  do_not_tumble_dry: 'Do not tumble dry',
  line_dry: 'Line dry',
  drip_dry: 'Drip dry',
  dry_flat: 'Dry flat',
  iron_low: 'Iron, low heat',
  iron_medium: 'Iron, medium heat',
  iron_high: 'Iron, high heat',
  do_not_iron: 'Do not iron',
  steam: 'Steam allowed',
  do_not_steam: 'Do not steam',
  dry_clean: 'Dry clean',
  dry_clean_p: 'Professional dry clean, P',
  do_not_dry_clean: 'Do not dry clean',
} as const satisfies Record<CareSymbolKind, string>

/** Nobody wears it: towels, sheets and anything shared. */
export const noWearerWords = 'Shared (towels, sheets)'

export const wearerKindWords = { adult: 'Adult', child: 'Child', baby: 'Baby' } as const satisfies Record<WearerKind, string>

export const occasionWords = {
  everyday: 'Everyday',
  work: 'Work',
  dressy: 'Dressy',
  sport: 'Sport',
  sleep: 'Sleep',
  lounge: 'Lounge',
} as const satisfies Record<Occasion, string>

/** The "What is it?" grid, in the order it is shown. */
export const kindWords = {
  t_shirt: 'T-shirt',
  shirt: 'Shirt or blouse',
  sweater: 'Sweater',
  pants: 'Jeans or pants',
  shorts: 'Shorts',
  skirt: 'Skirt',
  dress: 'Dress',
  outerwear: 'Jacket or coat',
  suit: 'Suit or blazer',
  pajamas: 'Pajamas',
  underwear: 'Underwear',
  socks: 'Socks',
  workout: 'Workout clothes',
  baby_bodysuit: 'Baby bodysuit',
  towel: 'Towel',
  sheets: 'Sheets',
  other: 'Other',
} as const satisfies Record<GarmentKind, string>

/**
 * A kind as a new garment's name ("Sam’s pants", or "Towel" when shared). "Other" has no name to
 * give: the person types one.
 */
export const kindNameWords = {
  t_shirt: 'T-shirt',
  shirt: 'Shirt',
  sweater: 'Sweater',
  pants: 'Pants',
  shorts: 'Shorts',
  skirt: 'Skirt',
  dress: 'Dress',
  outerwear: 'Jacket',
  suit: 'Blazer',
  pajamas: 'Pajamas',
  underwear: 'Underwear',
  socks: 'Socks',
  workout: 'Workout clothes',
  baby_bodysuit: 'Bodysuit',
  towel: 'Towel',
  sheets: 'Sheets',
  other: null,
} as const satisfies Record<GarmentKind, string | null>

/** The clothing-type tiles' words: short enough for a 76px tile under the garment's picture. */
export const kindTileWords = {
  t_shirt: 'T-shirt', shirt: 'Shirt', sweater: 'Sweater', pants: 'Pants', shorts: 'Shorts', skirt: 'Skirt', dress: 'Dress',
  outerwear: 'Jacket', suit: 'Blazer', pajamas: 'Pajamas', underwear: 'Underwear', socks: 'Socks', workout: 'Workout',
  baby_bodysuit: 'Bodysuit', towel: 'Towel', sheets: 'Sheets', other: 'Other',
} as const satisfies Record<GarmentKind, string>

/** The "What color?" swatches, in the order shown: the words, and the colour group each one stores. */
export const colourWords = {
  white: 'White',
  light: 'Light',
  saturated: 'Bright',
  medium: 'Medium',
  dark: 'Dark',
  black: 'Black',
  unknown: 'Mixed',
} as const satisfies Record<Exclude<ColorGroup, 'very_light'>, string>

/** One line under each swatch: examples of what falls in it, not rules. */
export const colourExamples = {
  white: 'White, off-white, cream, ivory',
  light: 'Pastels, light gray, heather, beige',
  saturated: 'Red, orange, hot pink, bright blue or green',
  medium: 'Mid gray, khaki, tan, muted colors',
  dark: 'Navy, charcoal, brown, burgundy, dark denim',
  black: 'Black and faded black',
  unknown: 'Stripes, prints, color blocks',
} as const satisfies Record<keyof typeof colourWords, string>

/** The line above the swatches: gray is the color people most often split three ways. */
export const colourHint = 'Pick the color that covers most of it.'

/**
 * A recorded color as en-US display text: the older "Grey" (alone or in "Heather grey") reads "Gray",
 * keeping its case. Display only; the stored color is never rewritten here.
 */
export function colorWord(color: string): string {
  return color.replace(/\bgrey\b/gi, (word) => (word === 'GREY' ? 'GRAY' : word[0] === 'G' ? 'Gray' : 'gray'))
}

/** A garment's color as shown: its recorded color word, or its color group when none was recorded. */
export function colorDisplay({ color, colorGroup }: { color?: string | null; colorGroup?: string | null }): string {
  return color ? colorWord(color) : colourWord(colorGroup)
}

/** Any stored colour group as a word; the older "very light" reads as its swatch, Light. */
export function colourWord(group: string | null | undefined): string {
  if (group === 'very_light') return colourWords.light
  return colourWords[(group ?? 'unknown') as keyof typeof colourWords] ?? colourWords.unknown
}

/** The flag sheet's "What happened?" chips. */
export const flagReasonWords = {
  worn: 'Worn or used',
  sweat: 'Sweaty / gym',
  food: 'Food or drink',
  mud_grass: 'Grass or mud',
  baby_mess: 'Spit-up or diaper',
  wet: 'Wet',
  smell: 'Smells',
  stain_other: 'Other stain',
} as const satisfies Record<FlagReason, string>

/** A garment's stored status as it reads on screen. "Worn" is not a status. */
export const statusWords = {
  clean: 'Ready',
  dirty: 'Waiting to wash',
  hanging: 'Hanging to dry',
  needs_dry_clean: 'Needs dry cleaning',
  at_cleaner: 'At the cleaner',
  needs_refresh: 'Needs a refresh',
} as const

/** The "?" beside a confusing question: its spoken name, and each tip's plain words. Tips go here, grouped by screen. */
export const helpTipText = {
  label: (topic: string) => `What does “${topic}” mean?`,
  /** Intake: the colour step and the last step. */
  intake: {
    dyeRun: {
      topic: 'Could the dye run?', hint: 'Go by previous washes.',
      words: 'Dye runs when it colors the wash water or transfers to other items.',
      fading: 'Fading alone doesn’t confirm dye running. If you haven’t seen what happens in the wash, choose “Not sure”.',
      caution: 'Past washes don’t guarantee it won’t run next time.',
    },
    preOwned: { words: 'You’ll choose whether it needs washing before saving. Pre-owned dye stays Not sure until a wash confirms it.' },
    setIn: { topic: 'Is it new, or old and set in?', words: 'Old stains often don’t come out. It’s saved as a known mark and won’t hold up washing.' },
  },
  // Questions in the wash and dry flow.
  capLine: { topic: 'Cap line', words: 'Most caps have lines inside, often numbered. Pick the line the bottle’s directions say to fill to.' },
  dryerSays: { topic: 'Dryer says', words: 'The dryer shows how many minutes are left. Type it and the next load is re-timed to finish when the dryer does.' },
  heldStart: { topic: 'Held start', words: 'Some washes wait on purpose so they finish when the dryer does. We remind you at the start time.' },
  dayPlan: { topic: 'All today or spread out', words: 'All today tries to do every load before you leave; the ones that won’t fit are shown and wait for tomorrow. Spread out does a few loads a day over more days. Home until: the plan ends before you leave.' },
  earlyCheck: { topic: 'Early check', words: 'A piece may be ready before the rest. We remind you to take it out while the dryer keeps going for everything else.' },
  water: { topic: 'Water hardness', words: 'How many minerals are in your tap water. Hard water makes detergent work less well, which is why some labels say to use more.' },
} as const

export const uiText = {
  evidenceOptions: [
    { value: 'verified', label: 'Read from the label or data plate' },
    { value: 'observed', label: 'Checked it myself' },
    { value: 'user-supplied', label: 'Entered from memory' },
    { value: 'estimated', label: 'Best guess' },
    { value: 'unknown', label: 'Unknown' },
  ] as const satisfies ReadonlyArray<{ value: EvidenceLevel; label: string }>,
  placements: {
    detergent_compartment: 'Detergent compartment',
    softener_compartment: 'Softener compartment',
    bleach_compartment: 'Bleach compartment',
    direct_to_drum: 'Directly in the drum',
    center_agitator: 'Center agitator',
    downy_ball: 'Dispensing ball',
  } satisfies Record<Placement, string>,
  stages: { prewash: 'Pre-wash', wash: 'Wash', rinse: 'Rinse', postwash: 'After the wash' } satisfies Record<(typeof washerStages)[number], string>,
  dryerDrum: 'In the dryer drum',
  dryingStage: 'Drying',
  loadSizes: { small: 'Small', medium: 'Medium', large: 'Large', extra_large: 'Extra large' } satisfies Record<LoadSize, string>,
  dryMethods: {
    line_dry: 'Line dry', dry_flat: 'Dry flat', drip_dry: "Hang wet, don't wring",
    tumble_dry: 'Dryer', do_not_tumble_dry: "Don't tumble dry", unknown: "Tag doesn't say",
  } satisfies Record<DryMethod, string>,
  dryerHeats: { no_heat: 'No heat', delicate: 'Delicates', low: 'Low heat', medium: 'Medium heat', high: 'High heat' } satisfies Record<DryerHeat, string>,
  holdOut: { line_dry: 'Hang to dry', dry_flat: 'Lay flat', drip_dry: "Hang wet, don't wring", do_not_tumble_dry: 'Hang to dry', unknown: 'Hang to dry' },
  dryerAnyHeat: 'Dryer, any heat',
  dryerWithHeat: (heat: string) => `Dryer, ${heat}`,
  notRecorded: 'Not recorded',
  slotNames: { detergent_compartment: 'Detergent', softener_compartment: 'Softener', bleach_compartment: 'Bleach', direct_to_drum: 'Into the drum', center_agitator: 'Agitator cup', downy_ball: 'Dispensing ball', dryer_drum: 'In the dryer' },
  slot: (name: string, doorLocks: boolean) => `${name} slot${doorLocks ? ' in the drawer' : ''}`,
  cupLines: 'The lines on the cap',
  less: (thing: string) => `Less: ${thing}`,
  more: (thing: string) => `More: ${thing}`,
  genericError: 'Something went wrong. Try again in a moment.',
  tryAgain: 'Try again',
  loading: (what: string) => `Loading ${what}…`,
  gettingReady: 'Getting things ready…',
  hasHeLogo: 'Has this logo',
  noHeLogo: 'No',
  logo: 'logo',
  notWornSince: (month: string) => `Not worn since ${month}`,
  wornTimes: (count: number) => `Worn ${count}×`,
  wornTimesDetail: (count: number) => `Worn ${count} ${count === 1 ? 'time' : 'times'} since washed`,
} as const

export type GarmentStatus = keyof typeof statusWords

const dayMs = 86_400_000
const startOfDay = (timestamp: number) => {
  const day = new Date(timestamp)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}
/** Whole calendar days from today's date to the timestamp's date, in this device's time zone. */
const calendarDays = (timestamp: number, now: number) => Math.round((startOfDay(timestamp) - startOfDay(now)) / dayMs)

/**
 * A day relative to today, for use inside a sentence: "today", "tomorrow", "yesterday", a weekday
 * ("Tue") within six days either way, and a date ("Sep 30") beyond.
 */
export function dayWord(timestamp: number, now: number): string {
  const days = calendarDays(timestamp, now)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (Math.abs(days) <= 6) return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(timestamp)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(timestamp)
}

/** A month for "Not worn since June": the year is added only when it is not this year. */
export function monthWord(timestamp: number, now: number): string {
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear()
  return new Intl.DateTimeFormat('en-US', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' }).format(timestamp)
}

/** The same month, short, for the chip on a hanger: "Jun". */
export function shortMonthWord(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(timestamp)
}

/** "1 thing", "3 things". */
export function countWord(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** English UI messages. Keep whole sentences here so another locale can change word order. */
export const appText = {
  productName: 'A Laundered Closet',
  skipToContent: 'Skip to content',
  primaryNavigation: 'Primary navigation',
  highEfficiencyLogo: 'high-efficiency logo',
  online: 'Online',
  offline: 'Offline',
  description: 'Your own care labels, product labels, and washer turned into exact loads.',
  tabs: { home: 'Home', laundry: 'Laundry', closet: 'Closet', household: 'Household', me: 'Me' },
  laundryTabWithHamper: (count: number) => `Laundry, ${countWord(count, 'laundry item')} waiting to wash`,
} as const

export const homeText = {
  viewCloset: 'Browse closet',
  readyToWear: 'Ready to wear',
  refresh: 'Refresh',
  cleaner: 'Dry clean',
  loadingTitle: 'Your clothes, cared for',
  careForClothes: 'Care for clothes',
  loadingLaundry: 'your laundry',
  band: {
    laundryLoad: 'Laundry load',
    stages: { preparing: 'Getting ready', washing: 'Washing', wash_done: 'Washed', drying: 'Drying', dry: 'Check dryness', finished: 'Done' },
  },
  dock: {
    nextStep: 'Next laundry step',
    checkCloset: 'Your closet',
    startLoad: (number: number) => `Start load ${number}`,
    startNamedLoad: (name: string) => `Start the ${name}`,
    checkSince: (time: string) => `check time ${time}`,
    checkClothes: (name: string) => `Check the ${name}`,
    checkDryness: 'Check dryness',
    drynessUnknown: 'Check whether the pieces are dry.',
    washedAt: (time: string) => `washed ${time}`,
    takeClothesOut: (name: string) => `Take the ${name} out`,
    moveClothes: (name: string) => `Move the ${name}`,
    clothes: 'clothes',
    aboutMinutes: (minutes: number) => `about ${minutes} min`,
    openLoadToChooseDryer: 'Open the load to choose a dryer',
    loadOf: (number: number, count: number) => `Load ${number} of ${count}`,
    machinePreparing: (machine: string) => `${machine} is getting ready`,
    machineRunning: (machine: string) => `${machine} is running`,
    checkAround: (time: string) => `Check around ${time}`,
    thenCheck: (name: string) => `Then check the ${name}`,
    load: 'load',
    open: 'Open',
    start: 'Start',
    allDry: 'All dry',
    airDrying: 'Hanging to dry',
    hangingToDry: (count: number) => `${countWord(count, 'laundry item')} hanging to dry`,
    seeThem: 'See them',
    everythingSetAside: 'Everything is set aside',
    inHamper: (count: number) => `${count} waiting to wash`,
    addClothes: 'Add clothes',
    reviewWaiting: 'Review clothes',
    hamperEmpty: 'Your hamper is empty',
  },
} as const

export const hubText = {
  machine: { washer: 'The washer', dryer: 'The dryer' },
  doseTo: (product: string, mark: string) => `${product} to ${mark}`,
  timer: (duration: string) => `Set a phone timer: ${duration}`,
  duration: (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`,
  doneAt: (time: string) => `done at ${time}`,
  loadOf: (number: number, count: number) => `Load ${number} of ${count}`,
  finished: (machine: string, toDryer: boolean) => `${machine} is done · ${toDryer ? 'move them to a dryer' : 'take them out'}`,
  empty: { eyebrow: 'Your hamper is empty', title: 'Add what needs washing', reason: 'Tap what it is, set how many.', button: 'Add dirty clothes' },
  hamper: {
    eyebrow: 'In the hamper',
    title: (count: number, loads: number | null) => `${countWord(count, 'laundry item')}${loads === null ? '' : ` · about ${countWord(loads, 'wash', 'washes')}`}`,
    reason: 'See what can wash together and what to use.',
    button: 'Plan laundry',
  },
  plan: { eyebrow: 'Your loads', ready: (load: string) => `${load} is ready`, waiting: (load: string) => `${load} is waiting`, readyReason: 'Take it to the washer.', waitingReason: 'It needs something from you first.', start: 'Start', carryOn: 'Carry on' },
  running: { eyebrow: 'Running now', title: (count: number) => `${countWord(count, 'load')} running`, button: 'See the steps' },
  finishedState: { eyebrow: 'Done' },
  drying: { eyebrow: 'Hanging to dry', title: (count: number) => `${countWord(count, 'laundry item')} drying · All dry?`, reason: 'Everything from those loads goes back in the closet.', allDry: 'All dry', seeThem: 'See them', short: (count: number) => `${countWord(count, 'laundry item')} drying`, question: 'All dry?' },
  dock: { isDone: (machine: string) => `${machine} is done`, more: (count: number) => ` (+${count})` },
} as const

export const recordText = {
  marks: { ready: 'Ready', waiting: 'Waiting', washing: 'Washing', drying: 'Drying', confirm: 'Needs confirmation', conflict: "Can't be used together", done: 'Done' },
} as const

export const sourceIssueText = {
  aGarment: 'A garment',
  aProduct: 'A product',
  closerLook: 'Needs a closer look',
  unnamed: { garment: 'A garment', product: 'A product', washer: 'The washer' },
  cantUseWith: (product: string, garments: string) => `${product} can't be used with ${garments}`,
  leftOutForBleach: 'Left out of this wash because the tag says do not bleach.',
  restricted: "Its label says it can't be used on this garment.",
  checkTag: 'Answer from the tag',
  checkPack: 'Check the pack',
  checkWasher: 'Check the washer',
  inspectStain: 'Inspect stain',
  saveStain: 'Save stain details',
  saveStainShort: 'Save details',
  stainSaved: 'Stain details saved.',
  pretreatWith: (product: string) => `Pretreat with ${product}`,
  choosePretreatment: 'Choose pretreatment',
  useAnother: 'Use another product',
  /** A wool or silk piece held out because the detergent has enzymes, or is not known to be free of them. */
  held: {
    enzymes: (product: string) => `Waits for a wool-safe detergent. ${product} has enzymes that harm wool.`,
    unconfirmed: (product: string) => `Waits for a wool-safe detergent. We couldn't confirm that ${product} has no enzymes.`,
    addSafe: 'Add a wool-safe detergent',
    findPack: "Find this bottle's exact pack",
    handWash: "I'll hand wash it",
    options: (name: string) => `Options for ${name}`,
  },
  leaveOut: 'Leave out',
  leaveOutNamed: (name: string) => `Leave ${name} out`,
  leavePiecesOut: (count: number) => `Leave these ${count} pieces out`,
  leftOutHeading: (count: number) => `Not in these washes (${count})`,
  sourceKind: { garment: 'Garment', product: 'Product', washer: 'Washer' },
} as const

export const sheetText = { close: 'Close', back: 'Back', discardTitle: 'Discard your changes?', keepEditing: 'Keep editing', discard: 'Discard' } as const

export const reasonText = {
  closerLook: 'Needs a closer look',
  product: 'A product',
  exclusion: {
    dryCleanOnly: 'Dry clean only', handWashOnly: 'Hand wash only', preOwnedFragile: 'Thin or damaged: hand wash it, or take it to a cleaner', noMachineWash: "The tag says don't machine wash",
    tooBig: 'Too big for the washer', noDelicateCycle: "Needs a delicate cycle this washer doesn't have",
    productRestricted: "A product in this load can't be used on it", productsConflict: "Two products can't go in together",
    unknownCare: "We don't know how to wash it yet", noCycle: "The washer doesn't have the cycle it needs",
    noSlot: "The washer doesn't have the slot a product needs",
    lockedDoor: (product: string) => `${product} goes in mid-cycle, and this washer's door locks`,
    invalidDose: (product: string) => `The saved amount for ${product} doesn't match its cap. Change it in Household.`,
    addWasher: 'Add your washer first', addDetergent: 'Add a detergent first',
  },
  actions: { addWasher: 'Add a washer', addProduct: 'Add a product' },
  pin: {
    wrongLoad: (name: string) => `The ${name} can't go in that load`,
    wrongCare: (name: string, care: string) => `The ${name} can't go in a ${care} load`,
    full: (name: string, group?: number) => `${group === undefined ? 'That load' : `Load ${group}`} is full. The ${name} won't fit.`,
    handWash: (name: string) => `The ${name} is hand wash only.`,
    dryClean: (name: string) => `The ${name} is dry clean only.`,
    noWash: (name: string) => `The tag on the ${name} says don't wash it.`,
    unknown: (name: string) => `We don't know how to wash the ${name} yet.`,
    restricted: "Its label says it can't go in this load",
  },
  together: { heavy: 'all very dirty', light: 'all lightly worn', pinned: 'you put these together', rush: 'washing now', baby: 'baby clothes on their own', colours: 'same colors', cycle: 'same cycle' },
  andMore: (names: readonly string[], more: number) => `${names.join(more > 0 ? ', ' : ' and ')}${more > 0 ? ` and ${more} more` : ''}`,
  bleach: { forbiddenOne: 'tag says do not bleach', forbiddenMany: 'tags say do not bleach', nonChlorineOne: 'tag allows only non-chlorine bleach', nonChlorineMany: 'tags allow only non-chlorine bleach' },
  leftOut: (product: string) => `${product} is left out this time.`,
  /** Scent beads' label: use with detergent; they add scent only. */
  needsDetergent: (product: string) => `${product} is left out: its label says to use it with detergent, and this load has none.`,
  noProduct: (product: string, clauses: readonly string[]) => `No ${product} this load: ${clauses.join('; ')}.`,
  bleed: (dark: string, light: string) => `${dark} may bleed onto ${light}; use cold`,
  soilMixed: 'Very dirty and lightly worn clothes are together; it’s dosed for the dirtiest.',
  babyMixed: 'Baby clothes are in with other clothes this time.',
  failSafe: 'Washed cold on a gentle cycle and hung to dry: the tag doesn’t say.',
  checkLabel: (sentence: string) => `${sentence} Check the label.`,
  dependsOnHe: (product: string) => `${product} is left out: its label depends on the`,
  notDosed: (product: string, soil: string) => `${product} isn’t dosed for ${soil} loads.`,
  these: 'these',
} as const

export const roomText = {
  classes: { top: { singular: 'top-loader', plural: 'Top-loaders' }, front: { singular: 'front-loader', plural: 'Front-loaders' }, washer: { singular: 'washer', plural: 'Washers' } },
  product: 'That product', productBare: 'product', products: 'These products', thisProduct: 'This product',
  standard: 'standard', matching: 'matching', he: 'HE',
  tooFull: (alternate: string, own: string) => `Too full for ${alternate}. Try ${own}.`,
  noLabelLine: (product: string, washer: string, own: string) => `Your ${product} label has no line for a ${washer} washer on record. Add it at home, or pick ${own}.`,
  rinseConflict: (pair: string, kind: string) => `${pair} can't share the rinse on ${kind}.`,
  noCycle: (cycle: string, kind: string) => `No ${cycle} cycle on record for ${kind}.`,
  noSlot: (product: string, kind: string) => `${product} needs a slot ${kind} don't have.`,
  cannotTake: (kind: string) => `${kind} can't take this load as planned.`,
  remind: " (I'll remind you)",
  was: (slot: string) => ` (was: ${slot})`,
  minutes: (minutes: number) => ` · ${minutes} min`,
  doorLocks: (duration: string) => `Door locks: everything goes in before Start${duration}`,
  lidOpens: (duration: string) => `Lid opens mid-cycle${duration}`,
  meta: { doorLocks: 'door locks', lid: 'lid', drawer: 'drawer', noDrawer: 'no drawer' },
} as const

export const closetKindText = {
  tops: 'Tops', bottoms: 'Bottoms', dresses: 'Dresses', outerwear: 'Outerwear', sleepwear: 'Sleepwear',
  underwear: 'Underwear & socks', sport: 'Sport', baby: 'Baby', linen: 'Towels & bedding', other: 'Other',
} as const

export const whyText = {
  product: 'This product',
  machineManual: 'Machine manual',
  productLabel: 'Product label',
  emptyTub: (product: string) => `${product} goes in the empty tub before the clothes: it disperses before they go in, so nothing sits concentrated on the fabric.`,
  rinseOnly: (product: string) => `${product} only in the rinse: detergent in the wash works against it.`,
} as const

export const doseText = {
  fillTo: (unit: string) => `Fill the ${unit} to`,
  twice: ', twice',
  times: (count: number) => `, ${count} times`,
  about: (volume: string) => `, about ${volume}`,
} as const

export const planningText = {
  guests: 'Guests',
  review: 'Your wash plan',
  back: 'Back to your wash plan',
  editSelection: 'Change clothes',
  selected: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'} included`,
  waitingForCare: 'Check the care details above to see which clothes can wash together.',
  noWashes: 'No machine washes are available for these clothes yet. Review the care and setup below.',
  task: {
    care_unknown: 'Check care label',
    dry_clean_only: 'Confirm dry cleaning',
    soil_level: 'Check how dirty',
    washer_he: 'Check washer type',
    product_safety: 'Check product safety',
    label_row: 'Check product directions',
    conflicting_rows: 'Review product directions',
    product_load_confirmation: 'Check product for this load',
  },
  washerClasses: { he: 'HE washer', standard: 'Standard washer' },
  saveAndReview: 'Update plan',
} as const

export const accountText = {
  signInUnavailable: 'Sign-in is unavailable',
  signInUnavailableDetail: 'We couldn’t check your sign-in just now. Your data is safe; try again in a moment.',
  tryAgain: 'Try again',
  loadingHousehold: 'your household',
  deletionFailed: 'Account deletion failed',
} as const

export const firstRunText = {
  householdName: (name: string | null) => name === null ? 'Home' : `${name}’s home`,
  me: 'Me',
} as const

export const settingsText = {
  backToMe: 'Back to Me',
  title: 'Settings',
  themes: { system: 'System', light: 'Light', dark: 'Dark' },
  appearance: 'Appearance',
  units: 'Units on this device',
  unitChoices: { auto: 'Automatic', imperial: 'US', metric: 'Metric' },
  followingRegion: (system: string) => `Following this device’s region: ${system}.`,
  chosenUnits: (units: string) => `${units} on this device. Doses stay stored as each label prints them.`,
  unitDescriptions: { imperial: 'US (fl oz, °F)', metric: 'Metric (ml, °C)' },
  doseUnits: { imperial: 'fl oz and °F', metric: 'ml and °C' },
  signOut: 'Sign out',
  deleteAccount: 'Delete account',
} as const

export const householdText = {
  sections: { bottles: 'Products', people: 'People' },
  show: 'Show',
  loadingMachines: 'washers and dryers',
  loadingProducts: 'products',
  loadingPeople: 'people',
  name: 'Name',
  person: 'Person',
  savePerson: 'Save person',
  someone: 'Someone',
  youSuffix: ' (you)',
  thisPerson: 'this person',
  leave: 'Leave',
  remove: 'Remove',
  productsTitle: 'Laundry products',
  machinesTitle: 'Machines',
} as const

export const garmentText = {
  sharedItem: 'Shared item',
  wornSinceWash: (count: number) => `Worn ${count}× since washed`,
  notWornSince: (month: string) => `Not worn since ${month}`,
  needed: (day: string) => `needed ${day}`,
  atCleanerSince: (day: string, pickup: string | null) => `At the cleaner since ${day}${pickup === null ? '' : ` · pick up ${pickup}`}`,
  hangingSince: (day: string) => `Hanging to dry since ${day}`,
  statusSince: (status: string, day: string) => `${status} since ${day}`,
  inWash: 'In the wash',
  washDoneAt: (time: string) => `In the wash · done at ${time}`,
  needsWashing: 'Needs washing',
  needsRefresh: 'Needs a refresh',
  refreshReason: 'What needs attention?',
  refreshReasons: { wrinkles: 'Wrinkles', odor: 'Smells', stored_long: 'Stored for a while' },
  refreshMethod: 'How did you refresh it?',
  refreshMethods: { air_out: 'Aired it out', steam: 'Steamed it' },
  refreshWaiting: 'Marked for a refresh in Closet.',
  updateCare: 'Update care details',
  updateCareHint: 'Stains, soil, and urgency',
  careRemoved: (count: number) => `${count} ${count === 1 ? 'item is' : 'items are'} Ready again.`,
  washedAnotherWay: 'Washed it another way',
  washedAnotherWayHint: 'Record a wash done elsewhere',
  refreshed: 'Refreshed',
  washInstead: 'Wash it instead',
  droppedOff: 'Dropped off',
  pickedUp: 'Picked up',
  allDry: 'All dry',
  marksLoadDry: 'Marks everything from that load as dry',
  open: 'Open',
  refreshedReady: (name: string, singular: boolean) => `Refreshed. ${name} ${singular ? 'is' : 'are'} ready.`,
  done: 'Done',
  removeGuest: 'Remove from Laundry',
  cancel: 'Cancel',
  noteOptional: 'Note (optional)',
  stainNotePlaceholder: 'Tell them about the stain',
  pickupOptional: 'Pick up by (optional)',
} as const

export const closetText = {
  all: 'All',
  needsCare: 'Needs care',
  manage: 'Manage closet',
  loadingTitle: 'Your clothes, together',
  today: 'today',
  running: {
    preparing: 'Load started',
    washing: 'Washing',
    washDone: (time: string) => `Washing · done at ${time}`,
    wash_done: 'Wash is done. Time to move it',
    drying: 'Drying',
    dryDone: (time: string) => `Drying · check at ${time}`,
    dry: 'Check dryness',
  },
  open: 'Open',
  planLaundry: 'Plan laundry',
  needed: (name: string, day: string) => `${name} is needed ${day}`,
  wetSince: (name: string, day: string) => `Wet ${name} since ${day}`,
  hamperWithLoads: (items: string, loads: string | null) => `${items}${loads === null ? '' : ` · about ${loads}`}`,
  dayPossessive: (day: string) => `${day.charAt(0).toUpperCase()}${day.slice(1)}’s`,
  hangingLoad: (day: string) => `${day} load is hanging to dry`,
  wetHamperSince: (name: string, plural: boolean, day: string) => `Wet ${name} ${plural ? 'have' : 'has'} been in the hamper since ${day}`,
  hamperSince: (items: string, plural: boolean, day: string) => `${items} ${plural ? 'have' : 'has'} been in the hamper since ${day}`,
  cleanerSince: (name: string, day: string) => `${name} at the cleaner since ${day}`,
  allDry: 'All dry',
  pickedUp: 'Picked up',
  states: { ready: 'ready', dirty: 'waiting to wash', in_wash: 'in the wash', hanging: 'hanging to dry', needs_dry_clean: 'needs dry cleaning', at_cleaner: 'at the cleaner', needs_refresh: 'needs a refresh' },
  hangerWorn: (count: number) => `worn ${count} ${count === 1 ? 'time' : 'times'} since washed`,
  hangerNotWorn: (month: string) => `not worn since ${month}`,
  onTheWay: (count: number) => `${count === 1 ? '1 laundry item is' : countWord(count, 'laundry item') + ' are'} on the way.`,
  title: 'Closet',
  addClothes: 'Add clothes',
  searchLabel: 'Search clothes',
  searchEmpty: 'No clothes match your search or filters.',
  ready: 'Ready',
  trash: 'Trash',
  trashCount: (count: number) => `Trash · ${count}`,
  trashHint: 'Removed clothes can be restored for 30 days. After that, their records are deleted.',
  trashEmpty: 'Nothing in Trash.',
  deleteOn: (day: string) => `Deletes ${day}`,
  restore: 'Restore',
  restored: 'Back in your closet.',
  needsYou: 'Needs you',
  needsYouNow: 'Needs you now',
  loading: 'your closet',
} as const

export const machineText = {
  slotWords: { detergent_compartment: 'Detergent', softener_compartment: 'Softener', bleach_compartment: 'Bleach' },
  heatExamples: { no_heat: 'No Heat', delicate: 'Delicates', low: 'Low', medium: 'Medium', high: 'High' },
  defaultNames: { washer: 'Washer', dryer: 'Dryer' },
  shared: 'Shared',
  atHome: 'At home',
  notInUse: 'Not in use',
  problems: {
    place: 'Tap where it is', kind: 'Tap washer or dryer', door: 'Tap the door it has', name: 'Give it a name',
    price: 'A price is between $0.01 and $100', minutes: 'Minutes are between 1 and 300', volume: 'Drum size is between 0.5 and 12 cu. ft.',
  },
  where: 'Where is it?',
  sharedRoom: 'Shared room',
  kind: 'Washer or dryer?',
  otherKind: 'Something else?',
  door: 'Door',
  front: 'Front',
  top: 'Top',
  heQuestion: 'Do you see this logo on it?',
  heHint: 'Check the lid, door rim or panel.',
  yes: 'Yes',
  no: 'No',
  notSure: 'Not sure',
  slots: 'Slots you see',
  underLidHint: 'Under the lid. Leave them off if there are none.',
  drawerHint: 'In the drawer. Leave them off if there are none.',
  pricePerStart: 'Price per start',
  priceExample: '$2.50',
  dryerMinutes: 'Minutes one start gives',
  washerMinutes: 'Minutes for a normal wash',
  minutesHint: 'Optional · leave blank to confirm when it finishes.',
  modelAndSize: 'Model and drum size',
  modelNumber: 'Model number',
  modelPlaceholder: 'On the machine label',
  drumSize: 'Drum size in cu. ft.',
  drumExample: 'e.g. 3.42',
  heatQuestion: 'What do the heat buttons say?',
  heatHint: 'Copy the button labels; leave missing buttons blank. Temperatures require the dryer’s specifications.',
  noHeatButton: 'Without one button, loads won’t use this dryer.',
  washerNameExample: 'Speed Queen washer',
  dryerNameExample: 'Speed Queen dryer',
  howMany: 'How many like it?',
  addsNumbered: (name: string, count: number) => `Adds ${name} 1 to ${count}.`,
  heatPlaceholder: (example: string) => `e.g. ${example}`,
  removedToast: (name: string) => `${name} removed`,
  restoredToast: (name: string) => `${name} restored`,
  addedManyToast: (count: number, name: string) => `${count} added: ${name} 1 to ${count}`,
  addedToast: (name: string) => `${name} added`,
  savedToast: (name: string) => `${name} saved`,
  nouns: { washer: 'washer', dryer: 'dryer', machine: 'machine' },
  addWasher: 'Add your washer',
  addDryer: 'Add your dryer',
  addMachine: 'Add a machine',
  groupSubtitle: 'Changes go to every one of them.',
  restore: 'Restore appliance',
  saveN: (count: number, noun: string) => `Save ${count} ${noun}s`,
  saveOne: (noun: string) => `Save ${noun}`,
} as const

export const productText = {
  forms: { liquid: 'Liquid', pods: 'Pods', powder: 'Powder', beads: 'Scent beads', sheets: 'Dryer sheets', balls: 'Dryer balls', dispenser: 'Dispenser' },
  problems: { form: 'Tap what it is', name: 'Give it a name', use: 'Tap what it is used for', scoop: 'Tap the marks on the scoop', cap: 'Tap the marks on the cap' },
  tools: { scoop: 'scoop', cap: 'cap' },
  name: 'Product name',
  namePlaceholder: 'Name on the package',
  type: 'Product type',
  use: 'What does it do?',
  marksSummary: (tool: string, marks: readonly string[]) => `Marks on the ${tool}${marks.length === 0 ? ' · needed' : ` · ${marks.join(', ')}`}`,
  marksHint: (tool: string) => `Copy the marks printed on the ${tool}.`,
  /** Unstopables' directions say a little or a lot, one capful to start; what each cap line is for is not known. */
  beadMarksHint: 'Tap each line printed on the cap. The label doesn’t say what each line is for; it says one capful is a good start. No lines? Type “Full cap”.',
  anotherMark: 'Another mark',
  anotherMarkPlaceholder: 'Another mark, as printed',
  add: 'Add',
  marksNext: 'Choose the label’s dose when planning a wash.',
  lookupFailed: 'Product lookup failed.',
  lookupFound: 'Product found. Check its type and use against your label; add the printed cap or scoop marks below.',
  addedToast: (name: string) => `${name} added`,
  savedToast: (name: string) => `${name} saved`,
  restoredToast: (name: string) => `${name} restored`,
  archivedToast: (name: string) => `${name} removed`,
  barcode: 'Barcode on the package',
  barcodePlaceholder: 'Scan or type the barcode',
  lookingUp: 'Looking up…',
  findProduct: 'Find product',
  namesFrom: 'Names from',
  openProductsFacts: 'Open Products Facts',
  checkOwnLabel: '. Check your own label for directions.',
  addProduct: 'Add a product',
  save: 'Save',
  suggestedUseHint: 'Check the suggested use against the package before saving.',
  findByBarcode: 'Find this product by barcode',
  restore: 'Restore product',
  remove: 'Remove product',
} as const

export const addClothesText = {
  adding: 'Adding…',
  colorQuestion: 'What color?',
  saved: 'Saved.',
  addedToHamper: (name: string, count: number) => count === 1 ? `${name} is waiting to wash in Laundry.` : `${countWord(count, 'laundry item')} are waiting to wash in Laundry.`,
  titles: { whose: 'Whose is it?', soil: 'How dirty?' },
  cancel: 'Cancel',
  someoneNew: 'Someone new',
  name: 'Name',
  personKind: 'Adult, child or baby',
  identity: {
    brand: 'Brand', size: 'Size', styleNumber: 'Style or item number',
    rnNumber: 'RN (small number on the tag)', barcode: 'Barcode',
  },
  finishCareLabel: 'Finish the care label answers before saving them.',
  clothingDetails: 'Clothing details',
  matchingPieces: (count: number) => `${count} matching pieces`,
  saveChanges: 'Save changes',
  changesApply: (count: number) => `Changes here apply to all ${count} selected items.`,
  quantity: 'Quantity',
  quantityHint: 'Fewer pieces move to Trash for 30 days. New pieces start Ready; check that their tags match.',
  finishCareBeforeRemoving: 'Finish the current care before removing these pieces.',
  matchingAdded: (count: number) => `${count} matching ${count === 1 ? 'piece' : 'pieces'} added to Ready.`,
  movedToTrash: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'} moved to Trash for 30 days.`,
  careStatus: 'Care status',
  removeCare: 'Remove care need',
  removeCareHint: 'The selected pieces return to Ready when you save.',
  careReturned: (count: number) => `${count} ${count === 1 ? 'piece is' : 'pieces are'} Ready again.`,
  ofMatching: (count: number, total: number) => `${count} of ${total}`,
  belongsTo: 'Belongs to',
  sharedItem: 'Shared household item',
  /** Under the house circle in "Whose is it?": towels, sheets and other things everyone uses. */
  shared: 'Shared',
  color: 'Color',
  exactColor: 'Specific color (optional)',
  notSet: 'Not set',
  careLabel: 'Care label',
  wearAndItemDetails: 'Manufacturer reference (optional)',
  addTagPhoto: 'Add a photo of the tag',
  tagPhotoAdded: 'Tag photo added',
  remove: 'Remove',
  tagPhotoFailed: ' The tag photo didn’t upload.',
} as const

export const flagText = {
  itemProgress: (name: string, item: number, total: number) => `${name} · ${item} of ${total}`,
  hamperOne: (name: string) => `${name} is waiting to wash in Laundry.`,
  hamperMany: (count: number) => `${countWord(count, 'laundry item')} are waiting to wash in Laundry.`,
  dryCleanOne: (name: string) => `${name} is dry clean only. It’s on the dry cleaning list.`,
  dryCleanMany: (count: number) => `${countWord(count, 'laundry item')} are dry clean only. They’re on the dry cleaning list.`,
  headsUp: (name: string) => `${name} will get a heads-up.`,
  needed: { none: 'No rush', today: 'Today', tomorrow: 'Tomorrow', pick: 'Pick a day' },
  titles: { reasons: 'What happened?', soil: 'How dirty?', needed: 'Needed by?', stain: 'Where’s the stain?' },
  cancel: 'Cancel',
  close: 'Close',
  next: 'Next',
  nextItem: 'Save and next item',
  saving: 'Saving…',
  putInHamper: 'Put in the hamper',
  putInDryCleaning: 'Add to dry cleaning',
  stainOptional: 'Where’s the stain? (optional)',
  stainExample: 'Left knee',
} as const

export const carePhotoText = {
  readFailure: 'Could not read that photo',
  uploadFailure: 'Upload failed',
  title: 'Care label photos',
  privacy: 'Only your household can see these. Location data is removed before upload.',
  photoNumber: (number: number) => `Photo ${number}`,
  view: 'View',
  delete: 'Delete',
  confirmDelete: 'Delete this photo? It is removed from storage.',
  imageAlt: 'Care label',
  working: 'Working…',
  add: 'Add a photo',
} as const

export const pwaText = {
  updateReady: 'An update is ready. It will load automatically when you finish and return to a main screen.',
  later: 'Later',
  installTitle: `Keep ${appText.productName} on your home screen`,
  install: 'Install app',
  safariInstructions: 'In Safari, tap Share, then “Add to Home Screen”.',
  browserInstructions: 'Find Install app in your browser’s address bar or menu.',
} as const

export const offlineText = {
  title: 'You’re offline',
  explanation: 'Reconnect to see your household. If a wash is running, its saved checklist is available on this device.',
  retry: 'Try again',
  otherLoads: (count: number) => count === 1 ? 'Your other load' : 'Your other loads',
} as const

export const routeErrorText = {
  denied: 'This isn’t available to you',
  failed: 'Something went wrong',
  deniedDetail: 'It belongs to another household, it was removed, or the link is wrong.',
  home: 'Go home',
} as const

export const notFoundText = {
  title: 'Page not found',
  detail: 'This address doesn’t lead anywhere. The link may be old or mistyped.',
  home: 'Go home',
  back: 'Back',
} as const

export const washedText = {
  backOne: (name: string) => `${name} is back in the closet.`,
  backMany: (count: number) => `${countWord(count, 'laundry item')} are back in the closet.`,
  title: 'How was it washed?',
  cancel: 'Cancel',
  hand: 'By hand',
  elsewhere: 'Somewhere else',
} as const

/** The intake's counted kind words and its first-run title. */
export const bulkText = {
  counted: {
    t_shirt: ['tee', 'tees'], shirt: ['shirt', 'shirts'], sweater: ['sweater', 'sweaters'], pants: ['pants', 'pants'],
    shorts: ['shorts', 'shorts'], skirt: ['skirt', 'skirts'], dress: ['dress', 'dresses'], outerwear: ['jacket', 'jackets'],
    suit: ['blazer', 'blazers'], pajamas: ['pajamas', 'pajamas'], underwear: ['underwear', 'underwear'], socks: ['sock', 'socks'],
    workout: ['workout top', 'workout clothes'], baby_bodysuit: ['bodysuit', 'bodysuits'], towel: ['towel', 'towels'], sheets: ['sheet', 'sheets'],
  } satisfies Record<Exclude<GarmentKind, 'other'>, readonly [string, string]>,
  firstTitle: 'What needs washing?',
} as const

export const fullnessText = {
  thisProduct: 'This product',
  yourWasher: 'your washer',
  notDosed: (product: string, size: string) => `${product} isn’t dosed for ${size} loads. Check the label or split the load.`,
  dryerQuestion: 'How full is the dryer?',
  beforeQuestion: 'How full will the drum be?',
  drumQuestion: 'How full is the drum?',
  labelSays: 'What the label says',
  invalidLine: 'This line doesn’t match the cap. Skip it this time.',
  skip: 'Skip',
  leaveProduct: 'Leave it out this time',
} as const

export const tagText = {
  notOnTag: 'Tag doesn’t say',
  tubTiles: ['Any temperature', 'Cold', 'Warm', 'Hot', 'Cold, permanent press', 'Cold, delicate'],
  dryCleanOnly: 'Dry clean only',
  dots: { 0: 'No dots', 1: 'Cold', 2: 'Warm', 3: 'Hot', 4: 'Very hot' },
  bars: { 0: 'No bar', 1: 'Permanent press', 2: 'Delicate' },
  dryer: { tumble: 'Any heat', low: 'Low heat', medium: 'Medium heat', no_heat: 'No heat' },
  washtub: 'Washtub on the tag',
  somethingElse: 'Something else',
  tubDots: 'Dots in the tub',
  tubBars: 'Bars under the tub',
  bleach: 'Bleach triangle',
  dryerSquare: 'Dryer square',
  naturalDrying: 'How it dries instead',
  moreOnTag: 'More on the tag',
  optionalGuide: 'Optional. Kept for its care guide.',
  iron: 'Iron',
  notAnswered: 'Not answered yet',
  answer: 'Answer',
  change: 'Change',
  close: 'Done',
} as const

export const questionText = {
  product: 'the product',
  productBare: 'product',
  pod: 'pod',
  this: 'this',
  yourWasher: 'your washer',
  grab: (name: string, vessel: string) => `Grab the ${name} ${vessel}.`,
  labelAmount: 'What does the back say about how much to use',
  countAmount: (unit: string) => `How many ${unit}s does it say to use`,
  labelFor: 'What does the back say for a ',
  countFor: (unit: string) => `How many ${unit}s for a `,
  load: ' load',
  washerLogo: (he: string) => ` in a washer ${he} `,
  pickAnswer: 'Pick an answer',
  leaveOut: 'Leave it out this time',
  tagSeveral: (name: string, count: number) => `Check the tag inside one ${name} (×${count}).`,
  tagOne: (name: string) => `Check the tag inside ${name}.`,
  oneCoversAll: (count: number) => `One answer covers all ${count}.`,
  dryCleanSeveral: (name: string, count: number) => `${name} (×${count}) is dry clean only.`,
  dryCleanOne: (name: string) => `${name} is dry clean only.`,
  soilQuestion: 'How dirty is each of these?',
  soilWithProduct: (name: string) => `How dirty is each of these? ${name}’s label changes with it.`,
  heQuestion: (name: string) => `Does ${name} have this logo? Check the lid, door rim or panel.`,
  conflict: (name: string) => `Two lines on the ${name} label fit this load. Which one do you use?`,
  moveToDryCleaning: 'Move to dry cleaning',
  logo: { yes: 'Yes', no: 'No', cantTell: 'Can’t tell' },
  allSoil: (word: string) => `All ${word}`,
  saveSoil: 'Save how dirty',
  useMark: (mark: string) => `Use the ${mark} mark`,
  useLine: (mark: string | number) => `Use line ${mark}`,
  useCount: (amount: number, unit: string) => `Use ${amount} ${unit}${amount === 1 ? '' : 's'}`,
  dependsDryer: 'It depends on how full the dryer is',
  dependsWasher: 'Depends on load size',
  askAtMachine: 'Ask me at the machine',
  labelSilent: 'The label doesn’t say',
  whichLine: (vessel: string) => `Which line does the ${vessel} say?`,
  sameEveryLoad: 'Same amount for every load?',
  yes: 'Yes',
  lessThanLine: 'Less than the line?',
  changeLine: 'Change the line',
  howMany: 'How many?',
  noMarks: (vessel: string) => `No marks are saved for this ${vessel} yet, so there are no lines to pick.`,
  veryDirty: 'This line also covers very dirty loads',
  everyLoad: 'It’s the same for every load',
  inDrawer: 'It goes in the drawer',
  typePrinted: 'Type what’s printed',
  typeLine: 'Type the line as printed, e.g. “Large load”',
  useTyped: (line: string) => `Use “${line}”`,
  line: (number: number) => `Line ${number}`,
} as const

/** The laundry-day kit (laundry-kit.tsx): a load's four steps and the tile that counts the rest. */
export const laundryKitText = {
  stages: ['Get ready', 'Wash', 'Dry', 'Put away'] as const,
  minLeft: 'min left',
  ringLabel: (minutes: number, machine: string) => `${machine}: ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`,
  stageLabel: (at: number) => at >= 4 ? 'All four steps done' : `Step ${at + 1} of 4: ${['Get ready', 'Wash', 'Dry', 'Put away'][at]}`,
  more: 'more',
} as const

export const loadText = {
  colours: { whites: 'Whites', lights: 'Lights', darks: 'Darks', brights: 'Brights', mixed: 'Mixed colors' },
  /** Two loads in a pass that would share a name say what is in them: "Whites · White tee", "Whites · White blouse +1". */
  sameName: (name: string, first: string, others: number) => `${name} · ${first}${others > 0 ? ` +${others}` : ''}`,
  alone: (name: string) => `${name} alone`,
  aProduct: 'A product',
  guestItem: 'Guest item',
  hangEverything: 'Hang everything',
  dryer: 'Dryer',
  dryerWithHeat: (heat: string) => `Dryer: ${heat}`,
  /** The dryer's capacity is unknown: the fit is reported, never assumed. */
  dryerFitNotChecked: 'Dryer capacity unknown · fit not checked',
  stainCheck: (name: string) => `${name} (check the stain is gone before using the dryer)`,
  title: (number: number, colour: string, soil: string) => `Load ${number} · ${colour}${soil === '' ? '' : `, ${soil}`}`,
  needed: (day: string) => `needed ${day}`,
  stainBeforeWash: (name: string, reason: string) => `${name}: ${reason}. Treat the stain before washing.`,
  candidates: 'the line is chosen when you see how full',
  askAtMachine: 'you read the label at the machine',
  moreFor: (name: string) => `More for ${name}`,
  hang: 'Hang:',
  whyTogether: (reason: string) => `Why together: ${reason}`,
  answerFirst: 'Check details for this wash',
  cancel: 'Cancel',
  moveTo: (number: number) => `Move to load ${number}`,
  newLoad: 'Move to a new load',
  notThisTime: 'Not this time',
} as const

export const machineStepText = {
  thisProduct: 'This product',
  leaveOut: 'Leave it out this time',
  /** The explanation link under a dose, named by what it explains: the place, or the moment. */
  whyHere: 'Why here?',
  whyNow: 'Why now?',
  /** The one quiet row under a step that opens every departure and recovery as a list. */
  somethingDifferent: 'Something different?',
  hints: {
    amount: 'Say how much went in',
    skip: 'Leave it out this time',
    missed: 'Say it was not done in time',
    switch: 'Pick a product you have',
    problem: 'Door, drawer or it won’t start',
  },
  /** Dev specimens only: a simulated step choice says what it would do instead of recording. */
  previewOnly: 'Preview only · nothing is recorded',
  previewWould: (choice: string) => `Preview only · tapped “${choice}”. Nothing is recorded.`,
  whichDryer: 'Which dryer?',
  hangToDry: 'Hang to dry',
  done: 'Done',
  putClothesIn: 'Put the clothes in',
  clothesIn: 'They’re in',
  closeDoor: 'Close the door',
  closeLid: 'Close the lid',
  doorClosed: 'The door is closed',
  lidClosed: 'The lid is closed',
  pressStart: 'Press Start',
  minutes: (count: number) => `${count} min`,
  noCycleTime: 'No cycle time on record: tap when it’s done.',
  pullHangItems: 'Pull out the hang items',
  staysOut: (count: number) => `${countWord(count, 'laundry item')} ${count === 1 ? 'stays' : 'stay'} out of the dryer`,
  clothesOut: 'They’re out',
  takeAndHang: 'Take it out and hang it',
  hanging: 'It’s hanging',
  intoDryer: 'Into the dryer',
  startDryer: 'Start the dryer',
  allDryHint: 'Finish time not recorded. Check dryness when it finishes.',
  dryerStarted: 'Dryer started',
  collectDryer: 'Collect from the dryer',
  allDry: 'All dry',
  nextStep: 'Next step',
} as const

export const sessionText = {
  notification: 'A laundry step is due.',
  now: 'now',
  minutes: (count: number) => `${count} min`,
  hoursMinutes: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
  documentDone: `Done · ${appText.productName}`,
  documentMinutes: (remaining: string) => `${remaining} · ${appText.productName}`,
  doneTime: 'Done time',
  runningUnknown: 'Finish time unknown. Add the washer’s cycle length in Household.',
  loadDone: 'Your load should be done. Time to collect it.',
  garment: 'Garment',
  productCapital: 'Product',
  backToLaundry: 'Back to Laundry',
  backToMe: 'Back to Me',
  backToCloset: 'Back to Closet',
  loadComplete: 'Load complete',
  /** The done moment's headline once the load's name is known; the line under it adds the total time. */
  loadDoneNamed: (name: string) => `${name}, done.`,
  piecesWashedDriedPutAwayIn: (count: number, total: string) => `${count} ${count === 1 ? 'piece' : 'pieces'} washed, dried and put away · ${total}`,
  loadCancelled: 'Load canceled',
  // A finished wash whose pieces are still in the drying queue is not complete yet.
  loadDrying: 'Drying',
  loadToPutAway: 'To put away',
  pieceDrying: { queued: 'Waiting to dry', drying: 'Drying', dry: 'Dry, to put away', put_away: 'Put away' },
  loadWaitingToDry: 'Waiting to dry',
  loadCheckDue: 'Check dryness',
  // One next action per load stage (session-stage.ts); each opens a screen and records nothing.
  loadNext: {
    preparing: 'Open load', washing: 'Open load', wash_done: 'Next step', drying: 'Open load', dry: 'Check dryness', finished: 'See load',
    queued_to_dry: 'See drying plan', pieces_drying: 'See drying', check_due: 'Check dryness', to_put_away: 'See what to put away', put_away: 'See load',
  },
  // The compact load summary (load-summary.tsx): where the load is, where it washed, what is in it.
  loadSummary: 'This load',
  loadPutAway: 'Put away',
  fromWashers: (washers: readonly string[]) => `From ${new Intl.ListFormat('en-US', { type: 'conjunction' }).format(washers)}`,
  finishedAt: (time: string) => `, finished ${time}`,
  pieceHistoryLabel: (name: string) => `${name}: open history`,
  inThisLoad: 'In this load',
  backInCloset: 'Back in the closet',
  howCaredFor: 'How it was cared for',
  receipt: { washed: 'Washed', dried: 'Dried', used: 'Used' },
  cleanPill: 'Clean',
  piecesWashed: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'} washed`,
  piecesWashedDriedPutAway: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'} washed, dried and put away`,
  washerDone: (washer: string) => `${washer} has finished`,
  moveToQueue: 'Move to drying queue',
  queueNote: 'Dryer loads are planned next. Each piece keeps its wash history.',
  goingInto: (machine: string) => `Going into ${machine}`,
  pieces: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'}`,
  washedStatus: (status: string, count: number) => ` · ${status} · washed ${count}×`,
  clean: 'clean',
  theDryer: 'The dryer',
  machineProblem: 'Machine problem?',
  offlineCopy: (time: string) => `You’re offline. This is the load as of ${time}; recording resumes when you reconnect.`,
  offlineLive: 'You’re offline. Keep tapping each step as you do it: it syncs when you reconnect.',
  savedOnPhone: 'Waiting for the connection.',
  keepOpen: 'Step taps are saved on this phone for recovery. Keep the app open to sync other changes.',
  dueSteps: (count: number) => count === 1 ? 'A step is due now.' : `${count} steps are due now.`,
  recordDue: 'Record each one when you’ve done it.',
  everything: 'That’s everything',
  finishLoad: 'Finish this load',
  finishing: 'Finishing marks these clothes clean.',
  doorLocked: 'Door locked',
  nothingToAdd: (time: string | null) => `Nothing to add${time === null ? ' until the cycle ends' : ` until ${time}`}.`,
  cancelTitle: 'Cancel this load?',
  cancelDetail: 'Nothing will be recorded as washed.',
  keepLoad: 'Keep the load',
  confirmCancel: 'Cancel the load',
  dryUnknown: 'Drying. No time on record: tap All dry when it’s done.',
  dueNow: 'Due now',
  theWasher: 'the washer',
  tapDryerNumber: 'Tap the number on the dryer you’re at.',
  timesFilled: (mark: string) => `Times you filled to ${mark}`,
  amountAdded: (unit: string) => `Amount you added (${unit})`,
  save: 'Save', back: 'Back', skipTitle: (name: string) => `Skip ${name}?`,
  missedTitle: (name: string) => `Missed ${name}?`,
  confirmSkipped: 'Yes, I skipped it', confirmMissed: 'Yes, I missed it',
  differentAmount: 'Used a different amount', skip: 'Skip', missed: 'I missed it',
  reconnect: 'Reconnect to record this step.',
} as const

export const laundryText = {
  today: 'today',
  guestItem: 'Guest item',
  stepsFor: 'Steps for:',
  emptyHamper: 'The hamper is empty',
  hamperHeading: (count: number, loads: number | null) => `${countWord(count, 'laundry item')}${loads === null ? '' : ` · about ${countWord(loads, 'load')}`}`,
  inHamper: (count: number) => `${countWord(count, 'laundry item')} waiting to wash`,
  drying: (count: number) => `${countWord(count, 'laundry item')} drying`,
  running: (count: number, time: string | null) => `${countWord(count, 'load')} running${time === null ? '' : ` · all dry ~${time}`}`,
  pipeline: { hamper: 'Waiting to wash', washing: 'In the wash', drying: 'Drying' },
  openLoad: 'Open wash',
  everythingClean: 'Everything is clean',
  from: (name: string) => `from ${name}`,
  needed: (day: string) => `needed ${day}`,
  tagChecked: 'tag checked',
  tagNotChecked: 'tag not checked',
  tagsNotChecked: (count: number) => `${countWord(count, 'tag')} not checked`,
  since: (day: string) => `since ${day}`,
  pickup: (day: string) => `pick up ${day}`,
  minutesLeft: (count: number) => `${count} min left`,
  theWasher: 'the washer',
  indefiniteWasher: (name: string) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`,
  started: (time: string) => `Started at ${time}. Its steps open once your phone has signal.`,
  startedWasher: (name: string) => `Started · ${name}. Its steps open once your phone has signal.`,
  loadingHamper: 'the hamper',
  loadingLoads: 'your loads',
  backToHamper: 'Back to the hamper',
  stale: 'Something changed, tap to update the loads',
  frontDoor: 'Door in front', topLid: 'Lid on top',
  cannotTake: (name: string) => `${name} can’t take this load`,
  differentSteps: (name: string) => `${name} takes different steps`,
  cancel: 'Cancel',
  useMachine: (number: string) => `Use ${number}`,
  machineBlocked: 'This washer can’t take this load as planned.',
  pickAnother: 'Pick another',
  whichKind: 'Which kind is it?',
  whichWasher: 'Which washer?',
  washerPrompt: (number: number) => `Load ${number} · choose the washer you’re using`,
  addWasher: 'Add your washer',
  addWasherHint: 'Start with its door type',
  addDetergent: 'Add your detergent',
  addDetergentHint: 'Name, type and cap marks',
  notInLoads: (count: number) => `Not in these loads (${count})`,
  dryCleaning: 'Dry cleaning',
  handWashCount: (count: number) => `Hand wash (${count})`,
  washedByHand: 'Washed by hand',
  needsToGo: (count: number) => `Needs to go (${count})`,
  atCleaner: (count: number) => `At the cleaner (${count})`,
  droppedOff: 'Dropped off', pickedUp: 'Picked up',
} as const

/** The drying queue: dryer loads planned apart from wash loads, the dryer screen, dryness and put-away. */
export const dryingText = {
  title: 'Drying',
  back: 'Back to Laundry',
  empty: 'Nothing waiting to dry',
  dryMark: 'Dry',
  allPutAway: 'All put away',
  acrossDryers: 'Across dryers and air drying',
  usingDryer: "The dryer you're using",
  intro: 'Grouped by drying instructions, across wash loads.',
  introShared: "No dryer is set aside ahead of time: enter the one you're loading and its fit is checked then.",
  introHome: (dryer: string) => `Grouped by each piece's drying tag and split to fit ${dryer}.`,
  heat: 'Heat',
  separateByHeat: 'Separate by heat',
  allOnLow: 'All on low heat',
  planFor: 'Plan for',
  capacityUnknown: 'Capacity unknown',
  capacitySize: (index: number) => `Size ${index + 1}`,
  unknownTitle: 'Dryer capacity unknown · fit not checked',
  unknownDetail: 'Grouped by heat only. Enter the dryer’s label when loading; its capacity is unknown.',
  loadTitle: (number: number, heat: string) => `Load ${number} · ${heat}`,
  pieces: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'}`,
  fitNotChecked: 'fit not checked',
  overCapacity: 'over capacity',
  fromWasher: (washer: string) => `from ${washer}`,
  loadInto: (dryer: string) => `Load into ${dryer}`,
  yourDryer: 'Your dryer',
  loadIntoADryer: 'Load into a dryer',
  startAir: (count: number) => `Start air drying ${count} ${count === 1 ? 'piece' : 'pieces'}`,
  dryingNow: 'Drying now',
  airDrying: 'Air drying',
  checkWhenDry: 'Check when dry',
  minutesLeft: (minutes: number) => `${minutes} min left`,
  timeUp: 'Time is up',
  dryToPutAway: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'} dry, to put away`,
  ownLoad: 'Own dryer load',
  mergeBack: 'Merge back',
  // The dryer screen: which dryer first, then what goes in, then only this load's overflow.
  whichDryer: 'Which dryer are you using?',
  dryerTitle: 'Dryer',
  dryerTitleShared: 'Which dryer?',
  dryerSubtitle: (number: number, heat: string, count: number) => `Load ${number} · ${heat} · ${count} ${count === 1 ? 'piece' : 'pieces'}`,
  labelHint: 'Number printed on it, e.g. 14',
  newDryer: (label: string) => `New dryer: ${label}`,
  newDryerHint: 'Uses the room’s dryer details. Capacity remains unknown.',
  usedBefore: 'Previously used',
  dryerTitleList: 'Dryers',
  showAll: (count: number) => `All ${count} dryers`,
  shortcutsOnly: 'Shortcuts only. Nothing is assumed free or reserved.',
  change: 'Change',
  goingIn: 'Going into this dryer',
  wontFit: "Won't fit · stays queued",
  wontFitNote: (dryer: string, count: number) => `${dryer} is full. ${count} ${count === 1 ? 'piece stays' : 'pieces stay'} queued for the next dryer.`,
  fitUnknownNote: (dryer: string) => `${dryer} has no recorded capacity · fit not checked.`,
  steps: 'Steps',
  stepLoad: (count: number, dryer: string) => `Load ${count} ${count === 1 ? 'piece' : 'pieces'} into ${dryer}.`,
  stepHeat: (heat: string) => `Choose ${heat} (the most limiting tag)`,
  stepPay: (price: string) => `Pay ${price} if asked`,
  stepStart: (dryer: string) => `Start ${dryer}, then enter its minutes`,
  noSetting: 'This dryer has no setting low enough for these pieces. Try another dryer.',
  coolerSetting: (button: string) => `${button}: Low may run hotter than this tag allows`,
  /** The button is this dryer's Low, whatever it is called (many home dryers print "Delicate" on it). */
  lowUnverified: (button: string) => `${button} is this dryer’s low setting. It may run hotter than this tag allows, and there is no cooler setting.`,
  minutesOn: (dryer: string) => `Minutes on ${dryer}`,
  enterMinutes: 'Enter the minutes it shows',
  enterDryer: 'Enter the dryer you are using',
  started: (dryer: string) => `I've started ${dryer}`,
  startedNote: (dryer: string, left: number) => `${dryer} started.${left > 0 ? ` ${left} still in the queue.` : ''}`,
  // Is it dry?
  isItDry: 'Is it dry?',
  checkEach: (where: string) => `${where} · check each piece`,
  switchOffDamp: 'Uncheck anything still damp',
  dry: (washer: string) => `Dry · from ${washer}`,
  countDry: 'Count what is dry · the rest keeps drying',
  dryOf: (dry: number, total: number, washer: string) => `Dry ${dry} of ${total} · from ${washer}`,
  dryStepper: (name: string) => `dry ${name}`,
  damp: (where: string) => `Still damp · stays ${where}`,
  extraMinutes: (dryer: string) => `Extra minutes on ${dryer}`,
  putAwayDry: (dry: number, damp: number) => (damp > 0 ? `Put away ${dry} · keep ${damp} drying` : `Put away ${dry} dry ${dry === 1 ? 'piece' : 'pieces'}`),
  restarted: (dryer: string) => `I've restarted ${dryer}`,
  // Put away
  putAway: 'Put away',
  partialFine: 'Count what goes back · partial is fine',
  dryList: 'Dry, to put away',
  notDryYet: 'Not dry yet',
  inQueue: 'in the drying queue',
  inDryer: (dryer: string) => `in ${dryer}`,
  queued: 'Queued',
  drying: 'Drying',
  putAwayCount: (count: number) => `Put away ${count} ${count === 1 ? 'piece' : 'pieces'}`,
  chooseWhat: 'Choose what is put away',
  staysToPutAway: (count: number) => `${count} ${count === 1 ? 'stays' : 'stay'} in "Dry, to put away".`,
  nothingDry: 'Nothing is dry and waiting.',
  putAwayDone: (count: number) => `${count} put away.`,
  // Methods other than the tumble dryer.
  heatNotSet: 'Heat not set by label',
  hangingTitle: 'Heated hanging',
  hangingNone: 'No hanging dryer recorded',
  startHanging: (dryer: string) => `Start ${dryer}`,
  lineTitle: 'Hang to dry',
  flatTitle: 'Lay flat',
  startLine: (count: number) => `Hang ${count} ${count === 1 ? 'piece' : 'pieces'} to dry`,
  startFlat: (count: number) => `Lay ${count} ${count === 1 ? 'piece' : 'pieces'} flat to dry`,
  unsetTitle: 'Needs a drying method',
  unsetCaption: 'Drying tag not recorded',
  neededSoon: (list: string) => `Needed soon: ${list}. Planned first with the equipment you have. No drying time is recorded, so a finish time isn't estimated.`,
  // Dryer products and a heat the label doesn't set.
  dryerProducts: 'Dryer products',
  productIn: (kind: string) => `${kind} · in this load`,
  productOptional: 'Optional · not in this load',
  productOut: 'Stays out of this load',
  stepProduct: (amount: string, name: string) => `Add ${amount} ${name} on top of the clothes`,
  stepProductAtMachine: (name: string) => `Add ${name} at the amount its label gives for how full the dryer is`,
  stepChooseHeat: 'Choose a heat setting yourself. The label does not set one for these pieces',
  chooseHeat: 'Heat setting',
  chooseHeatNote: 'No heat is assumed: pick the setting on this dryer you want for these pieces.',
  pickHeat: 'Choose a heat setting',
} as const

/** The garment record's tabs and history lines. */
export const garmentRecordText = {
  history: 'History',
  noHistory: 'No history yet',
  loadingHistory: 'care history',
  dryingPreference: 'Drying preference',
  washed: (washer: string | null, cycle: string | null) => `Washed${washer === null ? '' : ` in ${washer}`}${cycle === null ? '' : ` · ${cycle}`}`,
  waiting: 'Waiting to dry',
  driedWith: (what: string) => `Dried with ${what}`,
  tumbled: (dryer: string | null) => `Tumble dried${dryer === null ? '' : ` in ${dryer}`}`,
  hung: 'Hung to dry',
  scope: { once: '(this time only)', preference: '(your preference)' },
  evidence: { conflict: 'differs from label', not_established: 'compatibility not established by label', not_specified: 'not specified by label', tag_unknown: 'not specified by label' },
  minutes: (minutes: number) => `${minutes} min`,
  preferenceSet: (method: string) => `Drying preference changed to ${method}`,
  preferenceRemoved: 'Drying preference removed · follows label',
  /** One wash's fact cells: the step's word, then its short value. */
  fact: { washed: 'Washed', dried: 'Dried', used: 'Used', hung: 'Hung', none: '—' },
} as const

/** The drying method chooser: one per piece, from Plan dryer loads or the garment record. */
export const dryMethodText = {
  // The basic methods need nothing anyone lacks: a hanger, or a towel to lay a piece flat on.
  methods: { tumble: 'Tumble dryer', heated_hanging: 'Heated hanging dryer', rack_line: 'Hang to dry', flat: 'Lay flat' },
  /** How a wash dried, said in history ("Hung to dry (this time only)"). */
  past: { tumble: 'Tumble dried', heated_hanging: 'Dried in the heated hanging dryer', rack_line: 'Hung to dry', flat: 'Dried flat' },
  evidence: {
    allowed: 'Allowed by the recorded label',
    conflict: (label: string) => `Conflicts: label says ${label.toLowerCase()}`,
    not_specified: 'Not specified by the recorded label',
    not_established: 'Compatibility not established by recorded instructions',
    tag_unknown: 'Drying tag not recorded',
  },
  /** Why a stained piece air dries, and how it goes back to the dryer once someone checks it. */
  stain: {
    tag: 'Stain · air dry until you check it',
    note: 'This went into the wash with a stain. Dryer heat would set whatever is left of it, so it air dries until you check.',
    question: 'Stain gone?',
    answers: { gone: 'Gone', lighter: 'Lighter', still_there: 'Still there' },
    goneNote: 'It can go in the dryer now, as its label allows.',
    stayedNote: 'Noted. It keeps air drying; once it’s dry, its Care tab offers what to do next.',
  },
  /** Short tags on a row for a choice that isn't the label's own. */
  tag: {
    once: 'This time only',
    preference: 'Your preference',
    conflict: 'differs from label',
    not_specified: 'not specified by label',
    not_established: 'compatibility not established',
  },
  needs: { '2h': 'Needed within 2 hours', today: 'Needed today', tomorrow: 'Needed tomorrow' },
  needShort: { '2h': 'within 2 hours', today: 'today', tomorrow: 'tomorrow' },
  title: 'Change drying method',
  current: 'Current',
  preferenceMark: 'Preference',
  needsEquipment: 'Needs equipment recorded in Household',
  neededBy: 'Needed by',
  confirmTitle: 'Use a method the label does not set?',
  garment: 'Garment',
  count: 'Pieces',
  label: 'Drying label',
  chosen: 'Chosen method',
  thisTime: 'This time only',
  thisTimeHint: 'Ends when these pieces are put away',
  remember: 'Remember for this garment',
  rememberHint: 'Until you choose Follow label again',
  followLabel: 'Follow label again',
  save: 'Save',
  ownLoad: 'Own dryer load',
  mergeBack: 'Merge back',
  scopeNote: 'Applies to drying only. Washing and bleach rules are not affected.',
  saved: 'Saved. Planned loads recalculated.',
  preferenceTitle: 'Drying preference',
  naturalNotRecorded: 'Natural drying',
  notRecorded: 'Not recorded',
  unchanged: (label: string) => `${label} (unchanged)`,
  changePreference: 'Change preference',
  followsLabel: 'Follows the label again.',
} as const
