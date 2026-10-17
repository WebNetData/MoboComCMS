import type { Prisma } from '@prisma/client'
import { folderKey } from '@/modules/media/domain/library'
import { validOrganizationPath } from '@/modules/downloads/domain/organization'

/** Same canonical folder keys as the Library manager; transaction retries handle concurrent creation. */
export async function ensureOrganizationFolders(tx: Prisma.TransactionClient, destination: string, actorId: number) {
  if(!validOrganizationPath(destination))throw new Error('مسیر خودکار معتبر نیست')
  let parentId:number|null=null
  for(const name of destination.split('/')) {
    const key=folderKey(parentId,name)
    const folder:{id:number}=await tx.mediaFolder.upsert({where:{key},create:{key,name,parentId,createdById:actorId},update:{}})
    parentId=folder.id
  }
  return parentId
}
