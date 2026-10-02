import ReleasesManager from './ReleasesManager'

export default async function SoftwareReleasesPage({ searchParams }: { searchParams: Promise<{ softwareId?: string }> }) {
  const params = await searchParams
  const id = Number(params.softwareId)
  return <ReleasesManager initialId={Number.isSafeInteger(id) && id > 0 ? id : 0} />
}
