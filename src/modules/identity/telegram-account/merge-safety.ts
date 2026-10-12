import { Prisma } from '@prisma/client'

// These are the exact ownership columns transferred by the canonical attach owner.
const moved = new Set([
  'Order.userId', 'Subscription.userId', 'Ticket.userId', 'TicketMessage.userId',
  'CrmNote.userId', 'Post.authorId', 'Invoice.userId', 'Payment.userId',
  'WalletTx.userId', 'WalletAccount.userId', 'ApiKey.userId', 'AccessRestriction.userId',
  'UserProfile.userId',
])

// Source-confirmed human references without a User FK. Never infer content ownerId as UserId.
const scalarReferences: [string, string[]][] = [
  ['PromotionRedemption', ['userId']], ['ReferralCode', ['ownerId']],
  ['ReferralAttribution', ['referredUserId', 'referrerUserId']], ['ResellerSale', ['reviewerUserId']],
  ['FormSubmission', ['userId']], ['UserMembership', ['userId', 'createdBy']],
  ['Invoice', ['createdBy']], ['Expense', ['createdBy']],
  ['OtpCode', ['userId']], ['SmsLog', ['userId']], ['ForumPostRevision', ['userId']],
  ['ForumThread', ['lastPostUserId']], ['ForumConversation', ['userId', 'lastPostUserId']],
  ['DownloadLog', ['userId']], ['LinkReport', ['userId']], ['PasswordReset', ['userId']],
  ['ReturnRequest', ['userId']], ['StockAlert', ['userId']], ['LoyaltyEntry', ['userId']],
  ['LoyaltyAccount', ['userId']], ['CartReminder', ['userId']],
  ['NewsletterSubscriber', ['userId']], ['NewsletterDelivery', ['userId']],
  ['ContentPurchase', ['userId']], ['Seller', ['userId']], ['SellerReview', ['userId']],
  ['ChatConversation', ['userId']], ['CrmTag', ['userId']], ['Advertiser', ['userId']],
  ['ImportJob', ['createdById', 'executionActorId']],
]

const unsupported = Prisma.dmmf.datamodel.models.flatMap(model => {
  const fields = model.fields.filter(field => field.kind === 'object' && field.type === 'User')
    .flatMap(field => field.relationFromFields || [])
    .filter(field => !moved.has(`${model.name}.${field}`))
  return fields.length ? [[model.name, fields] as [string, string[]]] : []
})

type ReferenceReader = { findFirst(args: { where: { OR: Record<string, number>[] }; select: Record<string, boolean> }): Promise<unknown> }

/** Refuse unsupported ownership rather than letting Cascade/SetNull or scalar orphans lose data. */
export async function telegramMergeIsSafe(tx: Prisma.TransactionClient, source: Prisma.UserGetPayload<{}>, targetId: number) {
  if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) {
    await tx.$queryRaw`SELECT "userId" FROM "UserProfile" WHERE "userId" IN (${source.id}, ${targetId}) ORDER BY "userId" FOR UPDATE`
  }
  // These source preferences/security facts have no reconciled merge policy yet.
  if (source.phoneVerifiedAt || source.profileCompletedAt || source.profileData !== '{}' ||
      source.playbackPrefs !== '{}' || source.recommendationOptIn || source.recommendationListeningOptIn ||
      !source.smsAlerts || !source.emailAlerts || !source.pushAlerts || source.totpSecret ||
      source.totpEnabledAt || source.totpBackup !== '[]' || source.totpLastStep !== 0) return false

  const profile = await tx.userProfile.findUnique({ where: { userId: source.id } })
  if (profile && await tx.userProfile.findUnique({ where: { userId: targetId } })) return false

  for (const [model, fields] of [...unsupported, ...scalarReferences]) {
    const name = model[0].toLowerCase() + model.slice(1)
    const reader = (tx as unknown as Record<string, ReferenceReader>)[name]
    if (await reader.findFirst({ where: { OR: fields.map(field => ({ [field]: source.id })) }, select: { [fields[0]]: true } })) return false
  }
  return true
}

/** Retain the public username and exact profile facts; a collision was rejected before any effects. */
export async function moveTelegramProfile(tx: Prisma.TransactionClient, sourceId: number, targetId: number) {
  const profile = await tx.userProfile.findUnique({ where: { userId: sourceId } })
  if (profile) await tx.userProfile.updateMany({
    where: { userId: sourceId }, data: { userId: targetId, updatedAt: profile.updatedAt },
  })
}
