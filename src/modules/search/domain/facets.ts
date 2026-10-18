// Narrowing a search beyond the kind of item: who may open it, how members rated it, how new it is.
import { REVIEW_DIMENSIONS } from '@/modules/reviews/domain/dimensions'

export const SEARCH_DIMENSIONS = [...new Map(Object.values(REVIEW_DIMENSIONS).flat().map(dimension => [dimension.key, dimension])).values()]
export type SearchFacetInput = { access?: unknown; rated?: unknown; since?: unknown; sort?: unknown; dimension?: unknown; dimensionMin?: unknown }

export const SINCE_DAYS = { week: 7, month: 30, year: 365 } as const
export type Since = keyof typeof SINCE_DAYS
export const RATED_STEPS = [4, 3] as const

export type SearchFacets = {
  /** 'free': open to everybody; 'members': for members only. */
  access: '' | 'free' | 'members'
  /** The least average rating (out of 5) an item must have; 0 = any, rated or not. */
  rated: 0 | 3 | 4
  since: '' | Since
  /** Absent retains the original relevance ranking and original cursor scope. */
  sort?: 'newest' | 'rating'
  dimension?: string
  dimensionMin?: 3 | 4
}

export const NO_FACETS: SearchFacets = { access: '', rated: 0, since: '' }

export function normalizeFacets(input: SearchFacetInput | null | undefined): SearchFacets {
  const rated = Number(input?.rated)
  const dimension = SEARCH_DIMENSIONS.find(dimension => dimension.key === input?.dimension)?.key
  return {
    access: input?.access === 'free' || input?.access === 'members' ? input.access : '',
    rated: rated === 3 || rated === 4 ? rated : 0,
    since: typeof input?.since === 'string' && Object.hasOwn(SINCE_DAYS, input.since) ? input.since as Since : '',
    ...(input?.sort === 'newest' || input?.sort === 'rating' ? { sort: input.sort } : {}),
    ...(dimension ? { dimension, dimensionMin: Number(input?.dimensionMin) === 3 ? 3 : 4 } as const : {}),
  }
}

export const hasFacets = (facets: SearchFacets) => Boolean(facets.access || facets.rated || facets.since || facets.sort || facets.dimension)

/** Names the facets in force: part of what a page cursor belongs to, and '' when there are none. */
export const facetKey = (facets: SearchFacets) => (hasFacets(facets) ? `a=${facets.access};r=${facets.rated};s=${facets.since}${facets.sort ? `;o=${facets.sort}` : ''}${facets.dimension ? `;d=${facets.dimension};m=${facets.dimensionMin || 4}` : ''}` : '')

/** The facets as query parameters, in a fixed order, leaving out the ones that are off. */
export function facetParams(facets: SearchFacets): string {
  return [facets.access && `access=${facets.access}`, facets.rated && `rated=${facets.rated}`, facets.since && `since=${facets.since}`, facets.sort && `sort=${facets.sort}`, facets.dimension && `dimension=${facets.dimension}&dimensionMin=${facets.dimensionMin || 4}`].filter(Boolean).join('&')
}

/** The earliest publication time the "since" facet lets through, or null when it is off. */
export const sinceDate = (facets: SearchFacets, now: Date) => (facets.since ? new Date(now.getTime() - SINCE_DAYS[facets.since] * 86_400_000) : null)

/** Whether an item's rating passes: an item nobody rated never passes a rating facet. */
export const meetsRating = (rating: { average: number | null; count: number } | undefined, least: number) => least <= 0 || (!!rating && rating.count > 0 && rating.average !== null && rating.average >= least)
