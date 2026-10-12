import { requireModule } from '@/extensions/server/modules'
import BusinessManager from '@/components/businesses/BusinessManager'
export default async function BusinessesAdminPage() { await requireModule('businesses'); return <BusinessManager /> }
