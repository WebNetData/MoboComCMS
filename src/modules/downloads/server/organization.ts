import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { validOrganizationPath } from '@/modules/downloads/domain/organization'

/** Only the public content tree can be created; reject symlink components before writing. */
export async function organizedDirectory(root: string, destination: string) {
  if(!validOrganizationPath(destination))throw new Error('مسیر خودکار فایل معتبر نیست')
  await fs.mkdir(root,{recursive:true});const canonical=await fs.realpath(root)
  let current=canonical
  for(const segment of destination.split('/')) {
    current=path.join(current,segment)
    try{await fs.mkdir(current)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
    const stat=await fs.lstat(current)
    if(!stat.isDirectory()||stat.isSymbolicLink()||!((await fs.realpath(current)).startsWith(canonical+path.sep)))throw new Error('مسیر ذخیره‌سازی امن نیست')
  }
  return current
}
/** A decoded public cover is copied immutably; its historical URL and bytes are retained. */
export async function copyOrganizedCover(root: string, url: string, destination: string, checkpoint?:()=>Promise<void>) {
  const key=url.match(/^\/api\/media\/covers\/([a-f0-9-]{36}\.webp)$/i)?.[1]
  if(!key)throw new Error('تصویر عمومی قابل انتقال نیست')
  const covers=await fs.realpath(path.join(process.cwd(),'storage','covers')),source=path.join(covers,key)
  if((await fs.lstat(source)).isSymbolicLink()||!(await fs.stat(source)).isFile()||!((await fs.realpath(source)).startsWith(covers+path.sep)))throw new Error('تصویر عمومی معتبر نیست')
  const dir=await organizedDirectory(root,destination)
  await checkpoint?.()
  try{await fs.copyFile(source,path.join(dir,key),constants.COPYFILE_EXCL)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const target=path.join(dir,key);if((await fs.lstat(target)).isSymbolicLink()||!((await fs.realpath(target)).startsWith(await fs.realpath(root)+path.sep)))throw new Error('تصویر مقصد امن نیست')}
  return `/files/${[...destination.split('/'),key].map(encodeURIComponent).join('/')}`
}
