import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { ok, err } from '@/platform/http/response'
import { auditAdminStrict } from '@/platform/audit/server'
import { metadataConfig, saveMetadataConfig, lookupCinemaMetadata } from '@/modules/cinema/server/metadata'
import { readJsonObject } from '@/platform/http/read-json'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { libraryActor } from '@/modules/media/server/library'

export async function GET(req: NextRequest) {
  const g=await adminGuard(req,'cinema',['cinema.manage']);if('response' in g)return g.response
  try { return ok({config:await metadataConfig()}) } catch { return err('خواندن تنظیمات سرویس انجام نشد',503) }
}
export async function POST(req: NextRequest) {
  if(!originIsThisSite(req.headers.get('origin'),req.headers.get('host')||req.nextUrl.host))return err('forbidden',403)
  const g=await adminGuard(req,'cinema',['cinema.manage']);if('response' in g)return g.response
  if(!(await rateLimitStrict(`cinema.metadata:${g.admin.id}`,20)).ok)return err('تعداد درخواست زیاد است؛ کمی صبر کنید',429)
  try {
    const input=await readJsonObject(req,12000)
    if(input.action==='configure') {
      const config=await saveMetadataConfig(input)
      await auditAdminStrict({req,actor:g.admin,action:'cinema.metadata.settings',targetType:'setting',targetId:0,metadata:{enabled:config.enabled,provider:config.provider,copyImages:config.copyImages,cinemetaFallback:config.cinemetaFallback,peoplePhotos:config.peoplePhotos,persianNames:config.persianNames,persianNamesAi:config.persianNamesAi,tmdbConfigured:config.tmdbConfigured,omdbConfigured:config.omdbConfigured}})
      return ok({config})
    }
    if(input.action==='people-names') {
      const started=await (await import('@/modules/cinema/server/metadata/people-names')).startPeopleNamesBackfill(g.admin.id)
      await auditAdminStrict({req,actor:g.admin,action:'cinema.people-names',targetType:'BackgroundJob',targetId:started.id,metadata:{started:started.started}})
      return ok(started)
    }
    const result=await lookupCinemaMetadata(input.imdbId,input.kind,await libraryActor(req))
    await auditAdminStrict({req,actor:g.admin,action:'cinema.metadata.lookup',targetType:'cinema-metadata',targetId:0,metadata:{source:result.source}})
    return ok(result)
  }catch(error){return err(error instanceof Error && !/fetch|JSON|decrypt|cipher|token|Bearer/i.test(error.message)?error.message:'دریافت اطلاعات انجام نشد؛ تنظیمات سرویس را بررسی کنید',422)}
}
