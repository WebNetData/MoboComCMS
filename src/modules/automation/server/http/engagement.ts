import type { NextRequest } from 'next/server';
import { db } from '@/platform/database/prisma';
import { err, ok } from '@/platform/http/response';
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json';
import { originIsThisSite } from '@/platform/http/origin-policy';
import { rateLimitStrict } from '@/platform/http/rate-limit';
import { requirePerm } from '@/modules/identity/server/access';
import { memberDateFieldOptions } from '@/modules/identity/server/profile-fields';
import { sectionSettingsRevision } from '@/modules/settings/server';
import { RevisionError } from '@/modules/content/server/revisions';
import { publicProductWhere } from '@/modules/catalog/domain/product-publication';
import { isStoreEnabled } from '@/modules/catalog/server/storefront';
import { getEngagementSettings, saveEngagementSettings, previewEngagement, engagementOverview } from '../engagement';
import { EngagementError } from '../../domain/engagement';
async function guard(req: NextRequest) {
  const actor = await requirePerm(req, 'users.manage');
  return actor && (await requirePerm(req, 'automation.manage')) ? actor : null;
}
function answer(value: unknown) {
  const response = ok(value);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
const fail = (error: unknown) => {
  if (error instanceof EngagementError || error instanceof RevisionError || error instanceof JsonBodyError) return err(error.message, error.status);
  return err('اطلاعات ارتباط با مشتری در دسترس نیست؛ چیزی ارسال نشد', 503);
};
const sameOrigin = (req: NextRequest) => !!req.headers.get('origin') && originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host);
export async function GET(req: NextRequest) {
  if (!(await guard(req))) return err('برای این بخش دسترسی مدیریت کاربران و اتوماسیون لازم است', 403);
  try {
    if (req.nextUrl.searchParams.get('products') === '1') {
      const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 80);
      const products = (await isStoreEnabled()) ? await db.product.findMany({
        where: {
          ...publicProductWhere,
          ...(q ? {
            name: {
              contains: q
            }
          } : {})
        },
        select: {
          id: true,
          name: true
        },
        orderBy: {
          id: 'desc'
        },
        take: 30
      }) : [];
      return answer({
        products
      });
    }
    const [settings, overview, dateFields] = await Promise.all([getEngagementSettings(), engagementOverview(), memberDateFieldOptions()]);
    return answer({
      settings,
      revision: sectionSettingsRevision(settings),
      overview,
      dateFields
    });
  } catch (error) {
    return fail(error);
  }
}
export async function PUT(req: NextRequest) {
  if (!sameOrigin(req)) return err('درخواست باید از همین سایت باشد', 403);
  const actor = await guard(req);
  if (!actor) return err('دسترسی کافی نیست', 403);
  if (!(await rateLimitStrict(`crm-engagement:save:${actor.id}`, 30, 60000)).ok) return err('کمی بعد دوباره تلاش کنید', 429);
  const expected = req.headers.get('if-match');
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) return err('نسخهٔ تنظیمات لازم است؛ صفحه را تازه کنید', 428);
  try {
    const body = await readJsonObject(req, 128000);
    if (!body.settings || typeof body.settings !== 'object') return err('تنظیمات معتبر نیست', 422);
    const settings = await saveEngagementSettings(body.settings, {
      req,
      actor,
      expected
    });
    return answer({
      settings,
      revision: sectionSettingsRevision(settings)
    });
  } catch (error) {
    return fail(error);
  }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return err('درخواست باید از همین سایت باشد', 403);
  const actor = await guard(req);
  if (!actor) return err('دسترسی کافی نیست', 403);
  if (!(await rateLimitStrict(`crm-engagement:preview:${actor.id}`, 12, 60000)).ok) return err('کمی بعد دوباره تلاش کنید', 429);
  try {
    const body = await readJsonObject(req, 128000);
    return answer(await previewEngagement(body.settings, String(body.journeyId || '')));
  } catch (error) {
    return fail(error);
  }
}
