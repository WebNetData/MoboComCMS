/** Calendar day in Tehran ("YYYY-MM-DD"), the unit for daily stats and visitor hashes. */
export function tehranDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** The last `count` Tehran days, oldest first, ending today. */
export function lastDays(count: number, end: Date = new Date()): string[] {
  const days: string[] = []
  for (let i = count - 1; i >= 0; i--) days.push(tehranDay(new Date(end.getTime() - i * 86_400_000)))
  return [...new Set(days)]
}
