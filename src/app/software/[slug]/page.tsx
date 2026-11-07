import DetailView, { generateMetadata as detailMetadata } from './detail-view'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }
export function generateMetadata(props: Props) { return detailMetadata(props) }
export default function Page(props: Props) { return <DetailView {...props} /> }
