import {requireModule} from '@/extensions/server/modules'
import Admin from '@/components/pay/Admin'
export default async function Page(){await requireModule('mobocom-pay');return <Admin/>}
