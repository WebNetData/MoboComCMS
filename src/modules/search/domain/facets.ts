// Narrowing a search beyond the kind of item: who may open it, how members rated it, how new it is.
// A facet only ever removes results; the order of what is left is the ranking's, unchanged.

export const SINCE_DAYS = { week: 7, month: 30, year: 365 } as const
export type Since = keyof typeof SINCE_DAYS
export const RATED_STEPS = [4, 3] as const

export type SearchFacets = {
  /** 'free': open to everybody; 'members': for members only. */
  access: '' | 'free' | 'members'
  /** The least average rating (out of 5) an item must have; 0 = any, rated or not. */
  rated: 0 | 3 | 4
  since: '' | Since
}

export const NO_FACETS: SearchFacets = { access: '', rated: 0, since: '' }

export function normalizeFacets(input: { access?: unknown; rated?: unknown; since?: unknown } | null | undefined): SearchFacets {
  const rated = Number(input?.rated)
  return {
    access: input?.access === 'free' || input?.access === 'members' ? input.access : '',
    rated: rated === 3 || rated === 4 ? rated : 0,
    since: typeof input?.since === 'string' && input.since in SINCE_DAYS ? input.since as Since : '',
  }
}

export const hasFacets = (facets: SearchFacets) => Boolean(facets.access || facets.rated || facets.since)

/** Names the facets in force: part of what a page cursor belongs to, and '' when there are none. */
export const facetKey = (facets: SearchFacets) => (hasFacets(facets) ? `a=${facets.access};r=${facets.rated};s=${facets.since}` : '')

/** The facets as query parameters, in a fixed order, leaving out the ones that are off. */
export function facetParams(facets: SearchFacets): string {
  return [facets.access && `access=${facets.access}`, facets.rated && `rated=${facets.rated}`, facets.since && `since=${facets.since}`].filter(Boolean).join('&')
}

/** The earliest publication time the "since" facet lets through, or null when it is off. */
export const sinceDate = (facets: SearchFacets, now: Date) => (facets.since ? new Date(now.getTime() - SINCE_DAYS[facets.since] * 86_400_000) : null)

/** Whether an item's rating passes: an item nobody rated never passes a rating facet. */
export const meetsRating = (rating: { average: number | null; count: number } | undefined, least: number) => least <= 0 || (!!rating && rating.count > 0 && rating.average !== null && rating.average >= least)
