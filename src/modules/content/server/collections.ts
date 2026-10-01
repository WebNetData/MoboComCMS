import { db } from '@/platform/database/prisma'
import { itemCard, itemCards } from '@/modules/content/server/registry'
import { parseItemKey, type ItemRef } from '@/modules/content/domain/items'
import type { Prisma } from '@prisma/client'
import { randomBytes } from 'node:crypto'

const PAGE_SIZE = 24
const MAX_ITEMS = 500
const VISIBILITY = ['PRIVATE', 'UNLISTED', 'PUBLIC'] as const
type Visibility = typeof VISIBILITY[number]

export class CollectionError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function collectionId(raw: unknown) {
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id <= 0) throw new CollectionError('Invalid collection')
  return id
}

function text(raw: unknown, max: number, required = false) {
  if (typeof raw !== 'string') throw new CollectionError('Invalid text')
  const value = raw.trim()
  if (value.length > max || (required && !value)) throw new CollectionError('Invalid text')
  return value
}

function coverUrl(raw: unknown) {
  const value = text(raw, 1000)
  if (value && !(/^https:\/\/[^\s]+$/i.test(value) || /^\/(?!\/)[^\s]*$/.test(value))) throw new CollectionError('Invalid cover URL')
  return value
}

function visibility(raw: unknown): Visibility {
  if (!VISIBILITY.includes(raw as Visibility)) throw new CollectionError('Invalid visibility')
  return raw as Visibility
}

function page(raw: unknown) {
  const value = Number(raw)
  return Number.isSafeInteger(value) ? Math.min(1000, Math.max(1, value)) : 1
}

export async function myCollections(userId: number) {
  return db.userCollection.findMany({
    where: { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 100,
    select: { id: true, ownerId: true, title: true, description: true, cover: true, visibility: true, updatedAt: true, _count: { select: { items: true } } },
  })
}

export async function publicCollections(rawPage: unknown) {
  const current = page(rawPage)
  const where = { visibility: { in: ['PUBLIC', 'EDITORIAL'] } }
  const [total, rows] = await Promise.all([
    db.userCollection.count({ where }),
    db.userCollection.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, title: true, description: true, cover: true, visibility: true, updatedAt: true, owner: { select: { name: true } }, _count: { select: { items: true, followers: true } } } }),
  ])
  return { items: rows, page: current, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total }
}

export async function collectionPublicMetadata(id: number) {
  return db.userCollection.findFirst({ where: { id, visibility: { in: ['PUBLIC', 'EDITORIAL'] } }, select: { title: true, description: true } })
}

export async function getCollection(id: number, viewerId: number | null, shareToken?: string) {
  const row = await db.userCollection.findUnique({
    where: { id },
    include: { owner: { select: { name: true } }, collaborators: { include: { user: { select: { name: true, email: true } } } }, items: { orderBy: { position: 'asc' }, take: MAX_ITEMS, select: { id: true, itemType: true, itemId: true, position: true } }, _count: { select: { followers: true } } },
  })
  const member = row && (row.ownerId === viewerId || row.collaborators.some((entry) => entry.userId === viewerId))
  if (!row || (row.visibility === 'PRIVATE' && !member) || (row.visibility === 'UNLISTED' && !member && (!shareToken || shareToken !== row.shareToken))) throw new CollectionError('Collection unavailable', 404)
  const refs = row.items.map((item) => parseItemKey(`${item.itemType}:${item.itemId}`)).filter((ref): ref is ItemRef => !!ref)
  const cards = await itemCards(refs)
  return { id: row.id, ownerId: row.ownerId, ownerName: row.owner.name, title: row.title, description: row.description, cover: row.cover, shareToken: row.visibility === 'UNLISTED' ? row.shareToken : null, visibility: row.visibility, updatedAt: row.updatedAt, followerCount: row._count.followers, canEdit: !!member, isOwner: viewerId === row.ownerId, members: viewerId === row.ownerId ? row.collaborators.map((entry) => ({ userId: entry.userId, name: entry.user.name, email: entry.user.email })) : [], items: row.items.flatMap((item) => { const card = cards.get(`${item.itemType}:${item.itemId}`); return card ? [{ id: item.id, position: item.position, card }] : [] }) }
}

export async function createCollection(userId: number, input: { title?: unknown; description?: unknown; cover?: unknown; visibility?: unknown }) {
  const access = visibility(input.visibility ?? 'PRIVATE')
  return db.userCollection.create({ data: { ownerId: userId, title: text(input.title, 120, true), description: text(input.description ?? '', 2000), cover: coverUrl(input.cover ?? ''), visibility: access, ...(access === 'UNLISTED' ? { shareToken: randomBytes(24).toString('base64url') } : {}) }, select: { id: true } })
}

export async function updateCollection(userId: number, id: number, input: { title?: unknown; description?: unknown; cover?: unknown; visibility?: unknown }) {
  const data = { ...(input.title !== undefined ? { title: text(input.title, 120, true) } : {}), ...(input.description !== undefined ? { description: text(input.description, 2000) } : {}), ...(input.cover !== undefined ? { cover: coverUrl(input.cover) } : {}), ...(input.visibility !== undefined ? { visibility: visibility(input.visibility) } : {}) }
  if (!Object.keys(data).length) throw new CollectionError('Nothing to update')
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UserCollection" WHERE id = ${id} FOR UPDATE`
    const current = await tx.userCollection.findFirst({ where: { id, ownerId: userId }, select: { visibility: true } })
    if (!current) throw new CollectionError('Collection unavailable', 404)
    await tx.userCollection.update({ where: { id }, data: { ...data, ...(data.visibility === 'UNLISTED' && current.visibility !== 'UNLISTED' ? { shareToken: randomBytes(24).toString('base64url') } : {}) } })
    if (data.visibility && data.visibility !== current.visibility && ['PRIVATE', 'UNLISTED'].includes(data.visibility)) {
      await Promise.all([tx.userCollectionSave.deleteMany({ where: { collectionId: id } }), tx.userCollectionFollow.deleteMany({ where: { collectionId: id } })])
    }
    return { saved: true }
  })
}

export async function deleteCollection(userId: number, id: number) {
  const result = await db.userCollection.deleteMany({ where: { id, ownerId: userId } })
  if (!result.count) throw new CollectionError('Collection unavailable', 404)
  return { deleted: true }
}

async function writableCollection(tx: Prisma.TransactionClient, id: number, userId: number) {
  await tx.$queryRaw`SELECT id FROM "UserCollection" WHERE id = ${id} FOR UPDATE`
  const collection = await tx.userCollection.findFirst({ where: { id, OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] }, select: { id: true } })
  if (!collection) throw new CollectionError('Collection unavailable', 404)
}

export async function addCollectionItem(userId: number, id: number, rawRef: unknown) {
  const ref = parseItemKey(rawRef)
  if (!ref || !await itemCard(ref)) throw new CollectionError('Item unavailable', 404)
  return db.$transaction(async (tx) => {
    await writableCollection(tx, id, userId)
    const existing = await tx.userCollectionItem.findUnique({ where: { collectionId_itemType_itemId: { collectionId: id, itemType: ref.type, itemId: ref.id } }, select: { id: true } })
    if (existing) return { added: false }
    const [last, count] = await Promise.all([tx.userCollectionItem.findFirst({ where: { collectionId: id }, orderBy: { position: 'desc' }, select: { position: true } }), tx.userCollectionItem.count({ where: { collectionId: id } })])
    if (count >= MAX_ITEMS) throw new CollectionError('Collection is full')
    await tx.userCollectionItem.create({ data: { collectionId: id, itemType: ref.type, itemId: ref.id, position: (last?.position ?? 0) + 1 } })
    await tx.userCollection.update({ where: { id }, data: { updatedAt: new Date() } })
    return { added: true }
  })
}

export async function moveCollectionItem(userId: number, id: number, rawRef: unknown, direction: unknown) {
  const ref = parseItemKey(rawRef)
  if (!ref || (direction !== 'up' && direction !== 'down')) throw new CollectionError('Invalid move')
  return db.$transaction(async (tx) => {
    await writableCollection(tx, id, userId)
    const current = await tx.userCollectionItem.findUnique({ where: { collectionId_itemType_itemId: { collectionId: id, itemType: ref.type, itemId: ref.id } }, select: { id: true, position: true } })
    if (!current) throw new CollectionError('Item unavailable', 404)
    const neighbor = await tx.userCollectionItem.findFirst({ where: { collectionId: id, position: direction === 'up' ? { lt: current.position } : { gt: current.position } }, orderBy: { position: direction === 'up' ? 'desc' : 'asc' }, select: { id: true, position: true } })
    if (!neighbor) return { moved: false }
    await tx.userCollectionItem.update({ where: { id: current.id }, data: { position: -current.position } })
    await tx.userCollectionItem.update({ where: { id: neighbor.id }, data: { position: current.position } })
    await tx.userCollectionItem.update({ where: { id: current.id }, data: { position: neighbor.position } })
    await tx.userCollection.update({ where: { id }, data: { updatedAt: new Date() } })
    return { moved: true }
  })
}

export async function addCollectionCollaborator(ownerId: number, id: number, rawEmail: unknown) {
  const email = text(rawEmail, 254, true).toLowerCase()
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UserCollection" WHERE id = ${id} FOR UPDATE`
    const collection = await tx.userCollection.findFirst({ where: { id, ownerId }, select: { id: true } })
    if (!collection) throw new CollectionError('Collection unavailable', 404)
    const user = await tx.user.findUnique({ where: { email }, select: { id: true, status: true } })
    if (!user || user.status !== 'ACTIVE' || user.id === ownerId) throw new CollectionError('Member unavailable', 404)
    const existing = await tx.userCollectionCollaborator.findUnique({ where: { collectionId_userId: { collectionId: id, userId: user.id } }, select: { userId: true } })
    if (!existing && await tx.userCollectionCollaborator.count({ where: { collectionId: id } }) >= 10) throw new CollectionError('Collaborator limit reached')
    await tx.userCollectionCollaborator.upsert({ where: { collectionId_userId: { collectionId: id, userId: user.id } }, create: { collectionId: id, userId: user.id }, update: {} })
    return { added: true }
  })
}

export async function removeCollectionCollaborator(ownerId: number, id: number, userId: number) {
  const owner = await db.userCollection.findFirst({ where: { id, ownerId }, select: { id: true } })
  if (!owner) throw new CollectionError('Collection unavailable', 404)
  await db.userCollectionCollaborator.deleteMany({ where: { collectionId: id, userId } })
  return { removed: true }
}

export async function removeCollectionItem(userId: number, id: number, rawRef: unknown) {
  const ref = parseItemKey(rawRef)
  if (!ref) throw new CollectionError('Invalid item')
  return db.$transaction(async (tx) => {
    await writableCollection(tx, id, userId)
    const result = await tx.userCollectionItem.deleteMany({ where: { collectionId: id, itemType: ref.type, itemId: ref.id } })
    if (result.count) await tx.userCollection.update({ where: { id }, data: { updatedAt: new Date() } })
    return { removed: !!result.count }
  })
}

export async function followCollection(userId: number, id: number, on: boolean) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UserCollection" WHERE id = ${id} FOR UPDATE`
    const collection = await tx.userCollection.findFirst({ where: { id, visibility: { in: ['PUBLIC', 'EDITORIAL'] } }, select: { ownerId: true } })
    if (!collection || collection.ownerId === userId) throw new CollectionError('Collection unavailable', 404)
    if (on) await tx.userCollectionFollow.upsert({ where: { collectionId_userId: { collectionId: id, userId } }, create: { collectionId: id, userId }, update: {} })
    else await tx.userCollectionFollow.deleteMany({ where: { collectionId: id, userId } })
    return { following: on }
  })
}

export async function collectionIsFollowed(userId: number, id: number) {
  return !!await db.userCollectionFollow.findUnique({ where: { collectionId_userId: { collectionId: id, userId } }, select: { userId: true } })
}

export async function collectionIsSaved(userId: number, id: number) {
  return !!await db.userCollectionSave.findUnique({ where: { collectionId_userId: { collectionId: id, userId } }, select: { userId: true } })
}

export async function savedCollections(userId: number) {
  return db.userCollectionSave.findMany({
    where: { userId, collection: { OR: [{ visibility: { in: ['PUBLIC', 'EDITORIAL', 'UNLISTED'] } }, { ownerId: userId }, { collaborators: { some: { userId } } }] } },
    orderBy: { createdAt: 'desc' }, take: 100,
    select: { collection: { select: { id: true, title: true, cover: true, description: true, visibility: true, shareToken: true, owner: { select: { name: true } }, _count: { select: { items: true } } } } },
  })
}

export async function saveCollection(userId: number, id: number, on: boolean, shareToken?: string) {
  if (!on) {
    await db.userCollectionSave.deleteMany({ where: { collectionId: id, userId } })
    return { saved: false }
  }
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UserCollection" WHERE id = ${id} FOR UPDATE`
    const allowed = await tx.userCollection.findFirst({ where: { id, OR: [{ visibility: { in: ['PUBLIC', 'EDITORIAL'] } }, ...(shareToken ? [{ visibility: 'UNLISTED', shareToken }] : []), { ownerId: userId }, { collaborators: { some: { userId } } }] }, select: { id: true } })
    if (!allowed) throw new CollectionError('Collection unavailable', 404)
    await tx.userCollectionSave.upsert({ where: { collectionId_userId: { collectionId: id, userId } }, create: { collectionId: id, userId }, update: {} })
    return { saved: true }
  })
}
