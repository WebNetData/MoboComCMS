import PeopleManager from './PeopleManager'

export default async function CinemaPeopleAdmin({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const id = Number((await searchParams).edit)
  return <PeopleManager initialId={Number.isSafeInteger(id) && id > 0 ? id : null} />
}
