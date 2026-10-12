import type { DryerHeat } from '@washcloset/planner'

/**
 * Drying copy that follows the design's wording exactly (drying-view.tsx, drying-method.tsx). Strings
 * the older `dryingText` / `dryMethodText` in copy.ts still own are not repeated here.
 */

/** The drying label as the design reads it: "Tumble dry allowed", "Tumble dry, low heat", "Do not tumble dry", "Unknown". */
export function dryLabelWords(label: string, maxHeat: DryerHeat | string | null = null): string {
  if (label === 'tumble_dry') {
    if (maxHeat === 'low') return 'Tumble dry, low heat'
    if (maxHeat === 'delicate') return 'Tumble dry, delicate heat'
    if (maxHeat === 'no_heat') return 'Tumble dry, no heat'
    return 'Tumble dry allowed'
  }
  if (label === 'do_not_tumble_dry') return 'Do not tumble dry'
  if (label === 'line_dry') return 'Line dry'
  if (label === 'dry_flat') return 'Dry flat'
  if (label === 'drip_dry') return "Hang wet, don't wring"
  return 'Unknown'
}

export const dryingDesignText = {
  introHome: (split: boolean) => `Grouped across washes by drying label${split ? ' and recorded dryer size' : ''}.`,
  introShared: 'Grouped across washes by drying label. Choose a free dryer when loading to check its recorded size.',
  fitEstimate: 'Fit uses recorded machine size and estimated garment volume. Check actual drum space before starting.',
  loadOptions: 'Load options',
  clothes: 'Clothes',
  towels: 'Towels',
  bedLinen: 'Bed linen',
  waitingCount: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'} waiting to dry`,
  dryingCount: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'} drying`,
  beginDrying: 'Start drying',
  airStarted: (count: number) => `${count} ${count === 1 ? 'piece is' : 'pieces are'} air drying. Check them before putting them away.`,
  fitGuidance: 'About load size and heat',
  heatGuidance: 'The heat follows the most restrictive recorded care label.',
  hangingNone: 'No heated hanging dryer recorded',
  // The dryer screen: steps carry no closing full stop.
  stepLoad: (count: number, dryer: string) => `Load ${count} ${count === 1 ? 'piece' : 'pieces'} into ${dryer}`,
  stepHeat: (heat: string) => `Choose ${heat}`,
  // Is it dry?
  keepDrying: 'Keep drying',
  enterDampMinutes: 'Enter the minutes for the damp pieces',
  // An unsaved check is kept while you stay in Drying; the plan's run row says so.
  unsavedCheck: 'Unsaved check',
  discardCheck: 'Discard check',
  checkChanged: 'This load changed since your check. Review the counts, then save again.',
  // Put away
  staysToPutAway: (count: number) => `${count} ${count === 1 ? 'stays' : 'stay'} in "Dry, to put away" on Laundry.`,
  putAwayDone: (count: number, left: number) => `${count} put away.${left > 0 ? ` ${left} still to put away.` : ''}`,
  putAwayFact: (count: number, total: number, from: string, dried: string | null) => `${count} of ${total} · ${from} → ${dried ?? 'air dried'}`,
  // Change drying method sheet
  method: {
    fromWasher: (washer: string) => `from ${washer}`,
    yourPreference: 'Your preference',
    needNone: 'Not set',
    needOptions: { '2h': 'Within 2 hours', today: 'Today', tomorrow: 'Tomorrow' },
    neededBy: 'Needed by (optional)',
    neededByHint: 'Sets priority, not a guaranteed finish time.',
    noHangingDryer: 'No heated hanging dryer recorded',
    noDryer: 'No dryer recorded',
    missingHanging: 'No heated hanging dryer is recorded. Add one in Household to use it.',
    missingTumble: 'No dryer is recorded. Add one in Household to use it.',
    conflict: (name: string, count: number, chosen: string, label: string) => `${count} ${count === 1 ? 'piece' : 'pieces'} of ${name}: ${chosen} chosen, label says ${label.toLowerCase()}. A drying-only exception. The label stays as recorded and the method isn't declared safe.`,
    keep: 'Keep current method',
    thisTime: 'This time only',
    thisTimeHint: 'Ends when these pieces are put away',
    remember: 'Remember for this garment',
    rememberHint: (chosen: string, name: string) => `Future plans use ${chosen} for ${name} only`,
    save: 'Save',
    chooseHow: 'Choose how to apply it',
    followLabel: 'Follow label again',
    ownLoad: 'Own dryer load',
    individualLoads: 'Each piece in its own load',
    mergeBack: 'Merge back',
    notes: {
      replanned: 'Replanned.',
      kept: 'Kept the current method.',
      remembered: (name: string) => `Remembered for ${name}. Replanned.`,
      followsLabel: 'Follows the label again. Replanned.',
      split: 'Split into its own dryer load.',
      merged: 'Merged back where it fits.',
    },
  },
  // Drying preference sheet
  preference: {
    scopeNote: 'Applies to this garment only. Washing and bleach rules are not affected.',
    changePreference: 'Change preference',
  },
} as const

/** "Wash done, dryer busy": what the hub, the load and the drying page say while a wet load waits. */
export const dryerWaitText = {
  busyUntil: (time: string) => `Dryer busy until about ${time}`,
  isItFree: 'Is the dryer free?',
  hangOrWait: 'Hang them, or wait for the dryer.',
  rackFull: 'Rack full · wait for the dryer.',
  nextAfter: (number: number) => `Start load ${number} after this one is in the dryer.`,
  unloadFirst: (dryer: string) => `Take out ${dryer} first`,
  thenMoveIn: 'Then move the washed load in.',
  moveNow: 'Move them to the dryer now',
  waiting: (count: number) => `${count} washed ${count === 1 ? 'piece' : 'pieces'} waiting to dry`,
  intoADryer: 'Load them into a dryer, or hang them.',
  toHang: (count: number) => `${count} washed ${count === 1 ? 'piece' : 'pieces'} to hang or lay flat`,
  hangEach: 'Hang them or lay them flat, as each one says.',
  toDry: 'To dry',
  timeUp: 'Yours · time’s up, check dryness',
  hang: 'Hang them',
  wait: 'Wait for the dryer',
  hangOrWaitButton: 'Hang or wait',
  dryNow: 'Dry them',
  remindAt: (time: string) => `We'll remind you at about ${time}.`,
  hungNote: (hung: number, waiting: number) => `${hung} ${hung === 1 ? 'piece is' : 'pieces are'} hanging to dry.${waiting === 0 ? '' : ` ${waiting} ${waiting === 1 ? 'waits' : 'wait'} for the dryer.`}`,
  smell: 'It sat wet a long time. Smell it; rewash if it smells musty.',
  checkDryness: 'Check dryness',
  dryerCheck: (dryer: string) => `${dryer} · Check dryness`,
  /** The same words the server refuses a second start with (`dryerBusyReason`). */
  busyReason: (dryer: string) => `${dryer} still has a load in it. Take it out first`,
  yours: (time: string | null) => time === null ? 'Yours · drying' : `Yours · drying until about ${time}`,
} as const

/** Where a minute figure came from (design 10): the washer's program says nothing extra. */
const timeSource = (source: 'recorded' | 'learned', count?: number) => source === 'learned' ? ` (from your last ${count ?? 3} washes)` : ''

/** The "Next" line at home: the next wash joined to this trip, or held back so it ends with the dryer (design 9.1). */
export const nextStepText = {
  moveThenStart: (number: number) => `Move them to the dryer, then start load ${number}`,
  moveFirst: 'Move them to the dryer',
  startNow: (number: number) => `Start load ${number} now`,
  startAt: (number: number, time: string) => `Start load ${number} at about ${time}`,
  load: (number: number, name: string | undefined, minutes: number, source: 'recorded' | 'learned', count?: number) => `Load ${number}${name === undefined ? '' : `: ${name}`} · about ${minutes} min${timeSource(source, count)}`,
  /** The held start's receipt rows: the load, how long its wash takes, and when it is done with the dryer. */
  heldFacts: {
    washTakes: 'Wash takes',
    done: 'Done',
    washMinutes: (minutes: number, source: 'recorded' | 'learned', count?: number) => `about ${minutes} min${timeSource(source, count)}`,
    doneAt: (time: string) => `about ${time}, with the dryer`,
  },
  mayWait: (minutes: number) => `it may wait about ${minutes} min for the dryer`,
  thenStartAt: (number: number, time: string) => `Then start load ${number} at about ${time}, so it’s done when the dryer is.`,
  doneWithDryer: (time: string) => `done when the dryer is, at about ${time}`,
  ifNow: (minutes: number) => `Starting now, it would wait about ${minutes} min for the dryer.`,
  eyebrow: 'Next',
  dryerSays: 'Dryer says',
  minutes: 'min',
  dryerSaysHint: 'Type the minutes left on the dryer to re-time this.',
  remindAt: (time: string) => `We’ll remind you at about ${time}.`,
  saveDryerTime: 'Save dryer time',
  save: 'Save',
} as const

/** A shared room at the start of a pass (design 11): two quick answers, then how many washes to start. No clock. */
export const sharedStartText = {
  title: 'What’s free right now?',
  washers: 'Washers free',
  dryers: 'Dryers free',
  counts: [{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3+' }],
  skip: 'Skip',
  startNow: (count: number) => count === 1 ? 'Start 1 wash now' : `Start ${count} washes now`,
  why: 'One for each free dryer, plus loads that hang to dry.',
  startAll: (count: number) => `Start all ${count} now`,
  allWhy: 'Some may have to wait for a dryer, or hang them.',
  rest: 'Start the rest once a wash is done.',
  mark: 'Start now',
  later: 'Later',
  ask: 'Again',
} as const

/** A dryer priced by the block: its time as blocks and the price, from minutes the person or the program gives. */
export const dryerBlocksText = {
  about: (blocks: number, price: string) => `about ${blocks} ${blocks === 1 ? 'block' : 'blocks'} · ${price}`,
  pay: (about: string) => `Pay ${about} if asked`,
  perBlock: (price: string, minutes: number) => `Pay ${price} per ${minutes} min if asked`,
} as const

/** "Which dryer?" in a shared room with none free: hang what may hang, or wait (design 11, section 7). */
export const noDryerText = {
  noneFree: 'None free',
  title: 'No dryer free right now',
  detail: 'Hang them, or wait for one.',
  rackFull: 'Rack full · wait for one.',
  pickOne: 'A dryer is free now',
  wait: 'Wait for one',
  waiting: 'Waiting for a dryer.',
} as const

/** Likely-knit kinds as people say them (design 8.3). */
const knitWords: Readonly<Record<string, string>> = { t_shirt: 'tees', sweater: 'sweaters', workout: 'workout clothes', baby_bodysuit: 'baby bodysuits' }
/** "tees, sweaters and workout clothes" */
export const listWords = (words: readonly string[]) => words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`

/** The dryer sharing line (design 8.2, 9.3): offered, never preselected; time first, money only per start. */
export const dryerShareText = {
  /** `fit`: "sure" only for an observed or verified dryer size; "unchecked" with no size. */
  runs: (together: number, separate: number, fit: 'sure' | 'should' | 'unchecked') => {
    const count = `${together} dryer ${together === 1 ? 'run' : 'runs'} instead of ${separate}`
    return fit === 'should' ? `Should fit in ${count}` : fit === 'unchecked' ? `${count} · fit not checked` : count
  },
  allOn: (heat: DryerHeat) => heat === 'no_heat' ? 'All with no heat' : heat === 'delicate' ? 'All on delicate heat' : `All on ${heat} heat`,
  detail: (heat: DryerHeat) => `${dryerShareText.allOn(heat)}. Heavier pieces may need more time.`,
  damp: 'Heavier pieces may come out damp.',
  lessToStart: (price: string) => `(${price} less to start)`,
  label: 'Dryer runs',
  knitWords: (kinds: readonly string[]) => listWords([...new Set(kinds.map((kind) => knitWords[kind] ?? 'knit pieces'))]),
  knit: (words: string) => `${words.charAt(0).toUpperCase()}${words.slice(1)} can shrink if they tumble the whole time.`,
  hang: (words: string) => `Hang the ${words}`,
  hung: (words: string) => `The ${words} will hang to dry this time. Replanned.`,
} as const

/** The mid-run check (design 8.4 to 8.6, 9.3): for garments, never a damage claim; times are "about". */
export const midCheckText = {
  /** Said when the dryer starts: the reminder that is set and what it is for, in plain words. */
  remindIn: (minutes: number, names: string) => `We’ll remind you in about ${minutes} min to take out the ${names}.`,
  /** The dryer step's callout, as one string. */
  callout: (names: string, minutes: number) => midCheckText.remindIn(minutes, names),
  /** The Home and Laundry timer card for a running dryer with an early check ahead. */
  cardTitle: (dryer: string) => `${dryer} · early check`,
  cardLeft: (names: string) => `until you take out the ${names}`,
  cardKeepsGoing: (dryer: string) => `${dryer} keeps going for the rest.`,
  takeOutNow: (names: string) => `Take out the ${names} now`,
  takeOutShort: 'Take them out',
  checkIn: (minutes: number) => `Check in ${minutes} min`,
  checkNow: (names: string) => `Check now: ${names}`,
  checkNowShort: 'Check now',
  title: 'Take out early',
  /** The one plain instruction at the top of the screen, from what is chosen right now. */
  hangPart: (names: string, plural: boolean) => `Take out the ${names} and hang ${plural ? 'them' : 'it'}.`,
  dryPart: (names: string, plural: boolean, also: boolean) => `Take out the ${names}${also ? ' too' : ''}: ${plural ? 'they are' : 'it is'} dry.`,
  leavePart: (names: string, dryer: string) => `Leave the ${names} in, ${dryer} keeps going.`,
  allIn: (dryer: string) => `Leave everything in, ${dryer} keeps going.`,
  restart: (dryer: string) => `Then close the door and press Start on ${dryer}.`,
  /** The pieces to take out each show what happens to them; the rest is one line. */
  takeOutHeading: 'Take out now',
  hangIt: 'Hang it',
  dryOut: 'Dry, put away',
  stayIn: (names: string, plural: boolean) => `${names} ${plural ? 'stay' : 'stays'} in`,
  stayInOthers: (first: string, others: number) => `${first} and ${others} ${others === 1 ? 'other' : 'others'} stay in`,
  change: 'Change',
  answers: { dry: 'Dry', hang: 'Hang it', wait: 'Not yet' },
  answerLabel: (name: string) => `${name}: dry, hang it, or not yet`,
  /** The one primary: what happens. */
  done: { keepGoing: 'Done, dryer keeps going', empty: 'Done, the dryer is empty', none: 'Leave them all in' },
  saved: (hung: number, dry: number, left: number) => [hung > 0 ? `${hung} hanging to dry` : null, dry > 0 ? `${dry} dry` : null, left > 0 ? `${left} still in the dryer` : 'Nothing left in the dryer'].filter(Boolean).join(' · ') + '.',
  missed: (words: string) => `The early check was missed. ${words.charAt(0).toUpperCase()}${words.slice(1)} may have shrunk a little; check the fit when you put them away.`,
  tumbledThenHung: (minutes: number, dryer: string | null) => `Tumbled ${minutes} min${dryer === null ? '' : ` in ${dryer}`}, then hung`,
  checkMissed: 'early check missed',
} as const

/** The running-dryer card: a countdown ring and the early-check reminder as one row. */
export const dryingRunText = {
  takeOutAt: (names: string, time: string) => `Take out the ${names} at ${time}`,
} as const
