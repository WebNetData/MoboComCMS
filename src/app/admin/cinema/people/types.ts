export type Profile = { id: number; name: string; normalizedName: string; image: string; bio: string; imageLocked: boolean; profileVersion: number }
export type Detail = Profile & { publicCredits: number; moreCredits: boolean; credits: { id: number; role: string; character: string; title: { id: number; title: string; slug: string; status: string; publishedAt: string | null; kind: string } }[] }
export type PersonRow = Pick<Profile,'id'|'name'|'image'|'imageLocked'> & { roles: string[]; creditCount: number; publicCredits: number }
export type People = { people: PersonRow[]; total: number; page: number; pages: number }
