export type ProblemKind = 'DOWNLOAD' | 'AUDIO' | 'VIDEO' | 'CONTENT'

export const problemKindLabel = (kind: ProblemKind, locale: 'fa' | 'en') => {
  const labels: Record<ProblemKind, [string, string]> = {
    DOWNLOAD: ['دانلود کار نمی‌کند', 'Download problem'],
    AUDIO: ['پخش موسیقی مشکل دارد', 'Audio playback problem'],
    VIDEO: ['پخش ویدیو مشکل دارد', 'Video playback problem'],
    CONTENT: ['مشکل در محتوا یا صفحه', 'Content or page problem'],
  }
  return locale === 'fa' ? labels[kind][0] : labels[kind][1]
}

export const isProblemKind = (value: unknown): value is ProblemKind => value === 'DOWNLOAD' || value === 'AUDIO' || value === 'VIDEO' || value === 'CONTENT'

const REPORTABLE_PATH = /^\/(?:blog|cinema|games|software|p)\/[A-Za-z0-9][A-Za-z0-9_-]{0,119}$|^\/music\/(?:track|album)\/[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/
export const isReportablePath = (value: string) => REPORTABLE_PATH.test(value)
