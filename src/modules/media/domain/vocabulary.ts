import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'

/**
 * Lists shared by every section's download and stream links (films, episodes, games, software). The audio of a
 * release is a code of the AUDIO list; codes starting with DUBBED count as a dub and ORIGINAL as the original audio
 * for a member's "dub first / original first" preference. A quality stays free text; its list is the suggestions.
 */
export const MEDIA_LISTS: ListDefinition[] = [
  { section: 'media', list: 'AUDIO', title: 'صدای نسخه‌ها', one: 'نوع صدا', icon: '🎙️', codeRule: 'code', example: 'DUBBED_STUDIO',
    hint: 'در فرم لینک‌ها (فیلم، قسمت، بازی، نرم‌افزار) و سرگروه لینک‌ها در سایت. کد دوبله‌ها با DUBBED و زبان اصلی با ORIGINAL شروع شود تا ترجیح کاربران («اول دوبله» یا «اول زبان اصلی») شاملش شود.',
    codeHint: 'کد انگلیسی؛ برای دوبله با DUBBED شروع کنید (مثلاً DUBBED_STUDIO).',
    seeds: [['DUBBED', 'دوبله فارسی', 'Persian dub'], ['ORIGINAL', 'زبان اصلی', 'Original audio']] },
  { section: 'media', list: 'QUALITY', title: 'کیفیت‌ها', one: 'کیفیت', icon: '📺', codeRule: 'name', example: '1080p HDR',
    hint: 'پیشنهادهای فیلد «کیفیت» در فرم لینک‌ها؛ کیفیت لینک همچنان آزاد است و این فهرست فقط نوشتن را سریع و یک‌دست می‌کند.',
    codeHint: 'همان متنی که روی لینک نوشته و در سایت دیده می‌شود (مثلاً 1080p).',
    seeds: [['4K', '4K', '4K'], ['1080p', '1080p', '1080p'], ['720p', '720p', '720p'], ['480p', '480p', '480p']] },
]
