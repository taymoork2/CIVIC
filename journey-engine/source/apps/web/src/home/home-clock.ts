export const homeClock = (time: number) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(time).replace(/\s?[AP]M$/, '')
