/**
 * Words for Chemistry, the Preparation card's stage eyebrow and the Running screen, in the design's
 * own wording. Whole sentences, so another locale can change word order. Nothing is a product fact:
 * what is shown comes from the load's record, and what is missing says so.
 */

/** Chemistry's "This load" block. */
export const chemRunText = {
  /** The machine line beside "This load": its recorded type, never a guess. */
  machineHe: 'HE',
  machineStandard: 'standard',
  machineHeNotRecorded: 'HE not recorded',
  machineLine: (washer: string, type: string) => `${washer} · ${type}`,
  groups: {
    pretreat: 'Before loading',
    drum: 'In the drum, in this order',
    dispenser: 'In the dispensers',
    cycle: 'During the cycle, by hand',
  },
  settings: 'Settings',
  /** The footer: the way on, or why it cannot be taken. */
  resolveOpen: 'Resolve the open items',
  preparationNote: 'The timer starts when you confirm the machine is running.',
} as const

/** The step card's eyebrow after "Step n of N": where in the wash this step is. */
export const stageWords = {
  settings: 'Settings',
  clothes: 'Clothes',
  door: 'Door',
  lid: 'Lid',
  start: 'Start',
  drum: 'Drum',
  pretreat: 'Pretreat',
  beforeClothes: 'Before clothes',
  onTopOfClothes: 'On top of clothes',
  dispenser: 'Dispenser',
  drawer: 'Drawer',
  duringCycle: 'During the cycle',
  hang: 'Hang',
  dryer: 'Dryer',
  product: 'Product',
  step: 'Step',
} as const

/** The Running screen's footer link and the "Add time" sheet. */
export const addTimeText = {
  link: 'Add time',
  title: 'Add time',
  /** The field adds to the timer: the backend adds these minutes to the length the timer is working from. */
  field: 'Minutes to add',
  hint: 'Moves the finish time and following steps later.',
  update: 'Update timer',
  updated: 'Timer updated.',
  range: 'Enter between 1 and 120 minutes.',
} as const

/** The timer block: the time left, and where its length came from. */
export const timerText = {
  fromEntered: (minutes: number) => `From the ${minutes} min you entered`,
  /** The wash ends at the time the machine showed, so the sub-line is the design's; otherwise the recorded length is named. */
  check: (washer: string) => `Check ${washer}`,
  /** Once the wash is confirmed finished, the card is a record of when: no countdown. */
  finished: 'Finished',
  finishedAt: (washer: string, time: string) => `at ${time} · ${washer}`,
  /** The page title between the wash finishing and the dryer starting. */
  washed: 'Washed',
} as const
