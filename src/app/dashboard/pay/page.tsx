import {requireModule} from '@/extensions/server/modules'
import Dashboard from '@/components/pay/Dashboard'
export default async function Page(){await requireModule('mobocom-pay');return <Dashboard/>}
