import { notFound } from 'next/navigation'
import { isModuleEnabled, getModuleSettings } from '@/extensions/server/modules'
import { publicHostingCatalog } from '@/modules/hosting/server/catalog'
import { hourlyMinHours } from '@/modules/hosting/domain/services'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'
import { serviceOrderingAccess } from '@/modules/account/server/service-ordering'
import { BASE_CURRENCY } from '@/shared/money'
import CloudWizard from './CloudWizard'

/** Build a server, hosting or domain step by step; paying uses the existing hosting order and checkout. */
export default async function NewCloudService() {
  if (!await isModuleEnabled('hosting')) notFound()
  const access = await serviceOrderingAccess()
  const [servers, hosting, settings] = await Promise.all([publicHostingCatalog('servers'), publicHostingCatalog('hosting'), getModuleSettings('hosting')])
  const gateways = await checkoutGatewayOptions(servers[0]?.currency || hosting[0]?.currency || BASE_CURRENCY)
  return <CloudWizard servers={servers} hosting={hosting} gateways={gateways} minHours={hourlyMinHours(settings)} allowed={access.hosting} />
}
