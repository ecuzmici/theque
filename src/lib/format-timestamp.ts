/** SSR/client-stable: avoids hydration mismatch from default locale/timezone differences. */

const utcFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
})

export function formatDbTimestampUtc(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : utcFormatter.format(d)
}
