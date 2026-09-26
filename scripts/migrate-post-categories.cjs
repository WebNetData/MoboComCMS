// Run after db:push. Additive and safe to run again; existing assignments stay intact.
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const posts = await db.post.findMany({ where: { categoryId: { not: null } }, select: { id: true, categoryId: true } })
  for (const post of posts) await db.postCategoryAssignment.upsert({
    where: { postId_categoryId: { postId: post.id, categoryId: post.categoryId } },
    create: { postId: post.id, categoryId: post.categoryId }, update: {},
  })
  console.log(`Preserved category assignments for ${posts.length} existing posts.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
