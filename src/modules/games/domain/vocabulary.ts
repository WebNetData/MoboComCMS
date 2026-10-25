import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'
import { GAME_MODES, LOCALIZATIONS, STORES } from '@/modules/games/domain/games'
import { GAME_PLATFORMS } from '@/modules/media/domain/media'

/** The games section's managed lists. A game stores platform and store names, and mode and localisation codes. */
export const GAME_LISTS: ListDefinition[] = [
  { section: 'games', list: 'PLATFORM', title: 'پلتفرم‌ها', one: 'پلتفرم', icon: '🖥️', codeRule: 'name', example: 'Steam Deck',
    hint: 'روی هر بازی، در فیلتر پلتفرم، تقویم انتشار و تاریخ انتشار هر پلتفرم.', codeHint: 'نامی که روی بازی ذخیره و در سایت دیده می‌شود (مثلاً PS5).',
    seeds: GAME_PLATFORMS.map((code) => [code, code, code]) },
  { section: 'games', list: 'STORE', title: 'فروشگاه‌های رسمی', one: 'فروشگاه', icon: '🛒', codeRule: 'name', example: 'Ubisoft Store',
    hint: 'در «خرید از فروشگاه‌های رسمی» صفحهٔ هر بازی.', codeHint: 'نام فروشگاه که روی بازی ذخیره و نمایش داده می‌شود.',
    seeds: STORES.map((code) => [code, code, code === 'سایت رسمی' ? 'Official site' : code]) },
  { section: 'games', list: 'MODE', title: 'حالت‌های بازی', one: 'حالت بازی', icon: '🎮', codeRule: 'code', example: 'BATTLE_ROYALE',
    hint: 'نشان‌های صفحهٔ بازی و فیلتر «حالت بازی».', codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً BATTLE_ROYALE).',
    seeds: Object.entries(GAME_MODES).map(([code, name]) => [code, name, { SINGLE: 'Single-player', MULTI: 'Multiplayer', COOP: 'Co-op', ONLINE: 'Online' }[code] || code]) },
  { section: 'games', list: 'LOCALIZATION', title: 'فارسی‌سازی', one: 'نوع فارسی‌سازی', icon: '🗣️', codeRule: 'code', example: 'FA_VOICE',
    hint: 'نشان‌های فارسی‌سازی و فیلتر «فارسی‌سازی».', codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً FA_VOICE).',
    seeds: Object.entries(LOCALIZATIONS).map(([code, name]) => [code, name, { FA_SUB: 'Persian subtitles', FA_DUB: 'Persian dub', FA_UI: 'Persian menus' }[code] || code]) },
]
