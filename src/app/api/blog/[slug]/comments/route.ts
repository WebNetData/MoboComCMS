import type { NextRequest } from 'next/server'
import { GET as getComments, POST as postComment } from '@/modules/site/server/http/public/blog/[slug]/comments/route'
import { moduleGuard } from '@/extensions/server/modules'

type Context = { params: Promise<{ slug: string }> }

/** Journal comments are part of the journal module and 404 while it is disabled. */
export async function GET(req: NextRequest, context: Context) {
  return (await moduleGuard('journal')) || getComments(req, context)
}

export async function POST(req: NextRequest, context: Context) {
  return (await moduleGuard('journal')) || postComment(req, context)
}
