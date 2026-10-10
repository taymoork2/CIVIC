/** Words for the trial feedback feature: sending it, and the owner's list of what came in. */

export type FeedbackKind = 'bug' | 'confusing' | 'idea' | 'other'
export type FeedbackStatus = 'new' | 'seen' | 'done'

export const feedbackText = {
  section: 'Help us improve',
  send: 'Send feedback',
  sendHint: 'Bugs, confusing bits, ideas',
  received: 'Feedback received',
  receivedFact: (fresh: number) => (fresh === 0 ? 'Nothing new' : `${fresh} new`),
  kindLabel: 'What kind?',
  kinds: { bug: 'Bug', confusing: 'Confusing', idea: 'Idea', other: 'Other' } satisfies Record<FeedbackKind, string>,
  message: 'What happened?',
  messageHint: 'What did you expect? Don’t include passwords.',
  messageMissing: 'Write a few words about what happened.',
  includeScreen: 'Include this screen',
  includeScreenFact: (path: string) => `Shares ${path} and your device type.`,
  sending: 'Sending…',
  sent: 'Feedback sent.',
  done: 'Done',
  listTitle: 'Feedback received',
  listEmpty: 'No feedback yet.',
  listLoading: 'feedback',
  unknownSender: 'Someone in your household',
  unknownScreen: 'Screen not shared',
  statuses: { new: 'New', seen: 'Seen', done: 'Done' } satisfies Record<FeedbackStatus, string>,
  rowLabel: (kind: string, line: string, status: string) => `${kind}: ${line}. ${status}.`,
} as const
