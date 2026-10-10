/**
 * Words for the owner's trial notes: places where the app's dose and care thinking is still
 * hand-fed, mocked or unfinished. Shown only in builds with VITE_TRIAL_NOTES=1.
 * Source: docs/audits/2026-10-06-intelligence-reality-check.md.
 */
export const trialText = {
  label: 'Trial note',
  dose: 'This is the label’s amount for the load size you picked. A dose worked out for your water and load isn’t built yet.',
  personal: 'This only reorders optional extras. Detergent, dose, cycle and temperature don’t change yet.',
  dryerTime: 'The time starts from the program minutes you entered. Learning from your own runs needs 3 or more similar ones and isn’t fully tested.',
  preOwnedHeat: 'Heat treatment is a kill threshold, not a label setting: a dryer at 122 F or more for 20 to 30 minutes kills bed bugs, a freezer needs 0 F for 3 days, and lice need a sealed bag for 2 weeks. It is only offered when the tag allows high heat, and never by default. Washing alone does not kill bed bugs.',
  dryerLow: 'A low tag means about 140 F (60 C) at most. A Speed Queen dryer’s Low button runs 145 F by factory default (its manual), and its operator can reprogram it. Low is used only when its spec-sheet temperature is 140 F or less; without that, Delicates stands in when the dryer has it.',
  handEntered: 'Only 7 products come filled in from the catalog. Every other product’s label directions are typed in by hand.',
  water: 'Your water doesn’t change the dose yet. Every dose is still the label’s amount.',
  assessment: 'Stain answers here update the garment’s stain check. Other answers don’t change the next plan yet.',
} as const

/** Trial notes for the dryer-busy step: an estimate, and two numbers that are our own choices. */
export const dryerWaitTrialText = {
  busyUntil: (source: 'entered' | 'wash' | 'says' = 'entered') => `The dryer’s end time comes from ${source === 'says' ? 'what you typed from the dryer' : source === 'wash' ? 'the wash’s dryer time on record' : 'the minutes you entered when you started it'}. It is an estimate; look at the dryer.`,
  smell: 'Six hours is our own cautious choice. No maker gives a safe time for wet clothes.',
  rack: 'Your rack size is what you set in Household, or one load until you do.',
  nextStep: 'Times are estimates from the minutes on record or the ones you typed from the dryer; the app can’t see the machines. Holding a wash back when it would wait more than 30 minutes for the dryer is our own choice.',
  dayPlan: 'No time is shown until your machines have recorded minutes or your own last washes have taught them; nothing is guessed. Times use the longer of your washer’s time and your taps, plus 10 minutes on the dryer, so the day should end early, not late. The 9 pm end without an answer and the wait limit are our own choices.',
  blocks: 'Blocks and price come from the minutes you typed, else this dryer’s recorded program time, and the block length and price recorded for it. A longer run costs another block.',
  spread: 'Today’s loads come from what’s urgent or needed soon, then the fullest loads. Pieces that hang or are stained count a day early. Our own rule.',
  together: 'Only loads split by soil or by heavy and light pieces are offered, and only when they fit one wash and one dryer run.',
  share: 'Whether one low-heat run saves time on your dryers isn’t measured: low heat dries slower. Tees, sweaters, workout clothes and baby bodysuits are treated as knit by kind, our own rule, so a woven tee is flagged too.',
  midCheck: 'Checking at about half the time is our own guess inside a maker’s range, not a measured time for your dryer. Which pieces come out (tees and other likely knits, light pieces next to heavy ones, pieces no tag set the heat for) is our own rule.',
  sharedStart: 'Your answers stay on this phone and are used only for these first washes; the app can’t see which machines are free. One wash per free dryer is our own choice.',
} as const
