// The public timeline of an item: what happened to it that any visitor could already see somewhere on the
// site (it was published, a release came out, an episode aired, the magazine wrote about it, a forum topic
// was opened). It is put together from those public facts each time it is asked for.
//
// It is not the audit log. What staff did to an item (who edited, restored, approved) is privileged and
// stays in the audit log and the versions; nothing of it appears here. Nothing is stored for the timeline,
// so there is nothing to keep or to prune: an event leaves it the moment its source stops being public.

export type TimelineKind = 'published' | 'release' | 'episode' | 'article' | 'topic' | 'premiere'
export interface TimelineEvent { kind: TimelineKind; at: string; title: string; href: string; detail: string }

export const TIMELINE_LIMIT = 40
export const TIMELINE_LABEL: Record<TimelineKind, string> = { published: 'منتشر شد', release: 'نسخهٔ تازه', episode: 'قسمت تازه', article: 'در مجله', topic: 'گفت‌وگو در تالار', premiere: 'اکران' }

/** Newest first, nothing from the future, each event once, within the limit. */
export function orderTimeline(events: readonly TimelineEvent[], now: Date, limit = TIMELINE_LIMIT): TimelineEvent[] {
  const seen = new Set<string>()
  return events
    .filter((event) => { const at = Date.parse(event.at); return Number.isFinite(at) && at <= now.getTime() })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.kind.localeCompare(b.kind) || a.href.localeCompare(b.href))
    .filter((event) => { const key = `${event.kind}|${event.href}|${event.title}`; if (seen.has(key)) return false; seen.add(key); return true })
    .slice(0, Math.max(1, Math.min(TIMELINE_LIMIT, limit)))
}
