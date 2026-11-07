import { fromJalali, toJalali } from '@/shared/time/jalali';
import type { EngagementSettings, EngagementJourney } from './engagement';
const DAY = 86400000,
  OFFSET = 12600000;
export function engagementClock(now: Date) {
  const local = new Date(now.getTime() + OFFSET);
  return {
    day: local.toISOString().slice(0, 10),
    hour: local.getUTCHours(),
    dayStart: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET)
  };
}
export function inEngagementWindow(settings: Pick<EngagementSettings, 'startHour' | 'endHour'>, now: Date) {
  const h = engagementClock(now).hour,
    {
      startHour: s,
      endHour: e
    } = settings;
  return s === e || s < e && h >= s && h < e || s > e && (h >= s || h < e);
}
export function nextEngagementOpening(settings: Pick<EngagementSettings, 'startHour' | 'endHour'>, now: Date) {
  const clock = engagementClock(now),
    at = new Date(clock.dayStart.getTime() + settings.startHour * 3600000);
  return at > now ? at : new Date(at.getTime() + DAY);
}
export const endOfEngagementDay = (day: string) => new Date(Date.parse(day + 'T00:00:00Z') - OFFSET + DAY - 1);
function parts(date: Date, calendar: EngagementSettings['birthdayCalendar']) {
  if (calendar === 'persian') {
    const p = toJalali(date);
    return {
      year: p.jy,
      month: p.jm,
      day: p.jd
    };
  }
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}
/** The existing profile accepts Persian slash dates or ISO-shaped dates: calendar is explicit, never guessed. */
export function birthdayDate(value: unknown, calendar: EngagementSettings['birthdayInputCalendar'], now: Date): Date | null {
  if (typeof value !== 'string') return null;
  const latin = value.replace(/[۰-۹٠-٩]/g, ch => String('۰۱۲۳۴۵۶۷۸۹'.includes(ch) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(ch) : '٠١٢٣٤٥٦٧٨٩'.indexOf(ch))),
    match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(latin.trim());
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < (calendar === 'persian' ? 1200 : 1800)) return null;
  try {
    const date = calendar === 'persian' ? fromJalali(y, m, d) : new Date(Date.UTC(y, m - 1, d, 12));
    const round = parts(date, calendar);
    return round.year === y && round.month === m && round.day === d && date.getTime() <= now.getTime() ? date : null;
  } catch {
    return null;
  }
}
export function birthdayAnniversary(value: unknown, settings: EngagementSettings, now: Date): string | null {
  const born = birthdayDate(value, settings.birthdayInputCalendar, now);
  if (!born) return null;
  const today = new Date(engagementClock(now).day + 'T12:00:00Z'),
    a = parts(born, settings.birthdayCalendar),
    b = parts(today, settings.birthdayCalendar);
  if (b.year <= a.year) return null;
  const tomorrow = parts(new Date(today.getTime() + DAY), settings.birthdayCalendar),
    lastDay = tomorrow.month !== b.month;
  return a.month === b.month && (a.day === b.day || settings.leapDay === 'last-day' && lastDay && a.day > b.day) ? String(b.year) : null;
}
export function journeyPeriod(journey: EngagementJourney, now: Date) {
  const day = engagementClock(now).day;
  return journey.cadenceDays ? String(Math.floor(Date.parse(day + 'T00:00:00Z') / DAY / journey.cadenceDays)) : 'once';
}
export function journeyDatesAllow(journey: EngagementJourney, now: Date) {
  const day = engagementClock(now).day;
  return (!journey.startsOn || journey.startsOn <= day) && (!journey.endsOn || journey.endsOn >= day);
}
