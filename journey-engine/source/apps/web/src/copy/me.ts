/** Words for Me: who you are, laundry history, Account and Settings. */
export const meText = {
  title: 'Me',
  roles: { owner: 'Owner', member: 'Member', helper: 'Helper', guest: 'Guest' },
  washes: 'Laundry history',
  noWashes: 'No completed loads yet',
  showAllWashes: (count: number) => `Show all ${count} loads`,
  showFewerWashes: 'Show recent only',
  washPrice: (price: string) => `Wash · ${price}`,
  washPriceUnknown: 'Wash price not recorded',
  pieces: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'}`,
  account: 'Account',
  accountHint: 'Email, password, sign-in',
  settings: 'Settings',
  settingsHint: 'Appearance, alerts, units',
  loadingHistory: 'laundry history',
} as const
