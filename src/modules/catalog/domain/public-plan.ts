export interface PublicPlan {
  id: number
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  trafficGB: number
  days: number
  deviceLimit: number
  price: number
  currency: string
  featured: boolean
  panel: { name: string; type: string } | null
  /** VIP: PUBLIC | MEMBERS, lower member price (0 = none) and bonus VIP days. */
  access?: string
  memberPrice?: number
  vipGiftDays?: number
}

export interface PublicPlanRepository {
  listActive(): Promise<PublicPlan[]>
}
