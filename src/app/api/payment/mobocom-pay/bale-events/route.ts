import { apiErr } from '@/modules/public-api/server/v1'

export function POST() {
  return apiErr('این مسیر بازنشسته شده است. دریافت خودکار از مسیر پیامک بانکی انجام می‌شود.', 410, 'PAY_SOURCE_RETIRED')
}
